#include "../models/nas.hpp"
#include "handler.hpp"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_map>
using namespace nlohmann;

constexpr size_t BUFFER_SIZE = 64 * 1024;
std::string BASE_DIR = "public/nas";
// Helper function to trim whitespace
static std::string trim(const std::string& s) {
    auto start = s.begin();
    while (start != s.end() && std::isspace(*start)) {
        start++;
    }
    auto end = s.rbegin();
    while (end != s.rend() && std::isspace(*end)) {
        end++;
    }
    return std::string(start, end.base());
}

struct Part {
    std::string name;
    std::string filename; // optional
    std::vector<char> data;
};

// Simple multipart form data parser
class FormDataParser {
private:
    std::unordered_map<std::string, std::string> form_fields;
    std::string current_field_name;
    std::string current_field_value;
    bool is_file;
    
public:
    FormDataParser() : is_file(false) {}
    
    void parseHeader(const std::string& header) {
        
        if (header.find("Content-Disposition: form-data;") != std::string::npos) {
            size_t name_pos = header.find("name=\"");
            if (name_pos != std::string::npos) {
                name_pos += 6;
                size_t name_end = header.find('\"', name_pos);
                if (name_end != std::string::npos) {
                    current_field_name = header.substr(name_pos, name_end - name_pos);
                }
            }
            is_file = (header.find("filename=\"") != std::string::npos);
        }
    }
    
    void addData(const std::string& data) {
        if (!is_file && !current_field_name.empty()) {
            current_field_value += data;
        }
    }
    
    void fieldComplete() {
        if (!current_field_name.empty() && !is_file) {
            while (!current_field_value.empty() && 
                   (current_field_value.back() == '\n' || current_field_value.back() == '\r')) {
                current_field_value.pop_back();
            }
            form_fields[current_field_name] = current_field_value;
        }
        current_field_name.clear();
        current_field_value.clear();
        is_file = false;
    }
    
    const std::string& getField(const std::string& name) const {
        static const std::string empty;
        auto it = form_fields.find(name);
        return it != form_fields.end() ? it->second : empty;
    }
};

class MultipartParser {
private:
    enum class State {
        EXPECT_BOUNDARY,
        READ_HEADERS,
        READ_DATA,
        DONE
    };

    std::string buffer;
    std::string boundary_str;
    std::string close_boundary;
    State state;
    bool file_open;
    std::ofstream outfile;
    std::string current_name;
    std::string current_filename;
    std::unordered_map<std::string, std::string> current_headers;
    std::unordered_map<std::string, std::string> form_fields;

public:
    MultipartParser(const std::string &boundary)
        : boundary_str("--" + boundary),
          close_boundary("--" + boundary + "--"),
          state(State::EXPECT_BOUNDARY),
          file_open(false) {}

    const std::string& getFormField(const std::string &name) const {
        static const std::string empty;
        auto it = form_fields.find(name);
        return it != form_fields.end() ? it->second : empty;
    }

    // Call this repeatedly as you read chunks from the socket
    // data points to buffer, length is bytes read
    // Returns true if finished parsing all parts
  bool parse(const char *data, size_t length) {
    if (data == nullptr || length == 0) return false;
    
    buffer.append(data, length);

    while (true) {
      if (state == State::EXPECT_BOUNDARY) {
        if (!consumeBoundary())
          break;
      } else if (state == State::READ_HEADERS) {
        if (!consumeHeaders())
          break;
      } else if (state == State::READ_DATA) {
        if (!consumeData())
          break;
      } else if (state == State::DONE) {
        return true;
      }
    }
    return false;
  }

  static void parseContentDisposition(const std::string &val, std::string &name,
                                      std::string &filename) {
    name.clear();
    filename.clear();


    // Split header value into parts by semicolon
    std::vector<std::string> parts;
    std::string current;
    bool in_quotes = false;
    
    for (char c : val) {
      if (c == '"') {
        in_quotes = !in_quotes;
      } else if (c == ';' && !in_quotes) {
        if (!current.empty()) {
          parts.push_back(trim(current));
          current.clear();
        }
      } else {
        current += c;
      }
    }
    if (!current.empty()) {
      parts.push_back(trim(current));
    }

    // Process each part
    for (const auto& part : parts) {
      
      size_t eq = part.find('=');
      if (eq != std::string::npos) {
        std::string param_name = trim(part.substr(0, eq));
        std::string param_value = trim(part.substr(eq + 1));
        
        // Remove surrounding quotes if present
        if (param_value.size() >= 2 && param_value.front() == '"' && param_value.back() == '"') {
          param_value = param_value.substr(1, param_value.size() - 2);
        }
        
        
        if (param_name == "name") {
          name = param_value;
        } else if (param_name == "filename") {
          filename = param_value;
        }
      }
    }
  }

private:
  // Helper function for string operations
  static std::string trim(const std::string &s) {
    size_t start = 0;
    while (start < s.size() && std::isspace(s[start]))
      ++start;
    size_t end = s.size();
    while (end > start && std::isspace(s[end - 1]))
      --end;
    return s.substr(start, end - start);
  }

  // Helper: parse header line "Key: Value"
  static bool parseHeaderLine(const std::string &line, std::string &key,
                              std::string &value) {
    auto pos = line.find(':');
    if (pos == std::string::npos)
      return false;
    key = line.substr(0, pos);
    value = line.substr(pos + 1);
    key = trim(key);
    value = trim(value);
    return true;
  }

  // Parse Content-Disposition header params: name="fieldname";
  // filename="filename"
  // Consume boundary line from buffer; returns true if more parsing possible
  bool consumeBoundary() {
    // boundary line is boundary_str or close_boundary followed by \r\n
    size_t pos = buffer.find("\r\n");
    if (pos == std::string::npos)
      return false; // need more data

    std::string line = buffer.substr(0, pos);
    buffer.erase(0, pos + 2);

    if (line == close_boundary) {
      state = State::DONE;
      closeFileIfOpen();
      return false; // done parsing
    } else if (line == boundary_str) {
      current_headers.clear();
      current_name.clear();
      current_filename.clear();
      closeFileIfOpen();
      state = State::READ_HEADERS;
      return true;
    } else {
      // Unexpected line; could be first boundary missing or malformed request
      // Try to tolerate and search for first boundary again:
      size_t bpos = buffer.find(boundary_str);
      if (bpos != std::string::npos) {
        buffer.erase(0, bpos);
        return true;
      }
      // else wait for more data
      return false;
    }
  }

  // Consume headers lines, ends with empty line
  bool consumeHeaders() {
    while (true) {
      size_t pos = buffer.find("\r\n");
      if (pos == std::string::npos)
        return false; // need more data

      std::string line = buffer.substr(0, pos);
      buffer.erase(0, pos + 2);

      if (line.empty()) {
        // end of headers
        // parse Content-Disposition to get name and filename
        auto it = current_headers.find("content-disposition");
        if (it != current_headers.end()) {
          parseContentDisposition(it->second, current_name, current_filename);
          
          // If this is a file part, open the file for writing
          if (!current_filename.empty()) {
            std::string filepath = "./uploads/" + current_filename;
            outfile.open(filepath, std::ios::binary);
            if (!outfile.is_open()) {
              std::cerr << "Error opening file for writing: " << filepath << "\n";
              state = State::DONE;
              return false;
            }
            file_open = true;
          }
        } else {
        }
        state = State::READ_DATA;
        return true;
      }

      // parse header line
      std::string key, value;
      if (parseHeaderLine(line, key, value)) {
        // Normalize header keys to lower-case for simplicity
        std::transform(key.begin(), key.end(), key.begin(), ::tolower);
        current_headers[key] = value;
      } else {
        // malformed header, ignore or error
      }
    }
  }

  // Consume data until next boundary
  bool consumeData() {
    // The data ends at "\r\n--boundary"
    std::string boundary_marker = "\r\n" + boundary_str;
    std::string close_marker = "\r\n" + close_boundary;

    size_t pos = buffer.find(boundary_marker);
    size_t close_pos = buffer.find(close_marker);

    size_t boundary_pos = std::string::npos;
    bool is_final = false;

    if (pos != std::string::npos && close_pos != std::string::npos)
      boundary_pos = std::min(pos, close_pos);
    else if (pos != std::string::npos)
      boundary_pos = pos;
    else if (close_pos != std::string::npos) {
      boundary_pos = close_pos;
      is_final = true;
    }

    if (boundary_pos == std::string::npos) {
      // No boundary found yet - write all buffer (except last
      // boundary_str.size() + 4 chars to avoid cutting boundary)
      size_t safe_len = buffer.size() > (boundary_str.size() + 4)
                            ? buffer.size() - (boundary_str.size() + 4)
                            : 0;
      if (safe_len > 0) {
        writeData(buffer.data(), safe_len);
        buffer.erase(0, safe_len);
      }
      return false; // need more data
    } else {
      // Write data up to boundary_pos
      if (boundary_pos > 0) {
        writeData(buffer.data(), boundary_pos);
      }
      buffer.erase(0, boundary_pos);

      // After boundary marker is read, next state is EXPECT_BOUNDARY (boundary
      // line already consumed by caller)
      state = State::EXPECT_BOUNDARY;
      file_open = false;
      if (outfile.is_open())
        outfile.close();

      if (is_final) {
        state = State::DONE;
      }
      return true;
    }
  }

  void writeData(const char *data, size_t len) {
    if (data == nullptr || len == 0) return;


    // Handle file uploads
    if (file_open) {
      outfile.write(data, len);
      if (!outfile) {
        std::cerr << "[ERROR] Failed writing to file" << std::endl;
        return;
      }
      return;
    }

    // Handle form fields
    if (!current_name.empty()) {
      std::string value(data, len);

      // Remove any trailing CR/LF
      while (!value.empty() && (value.back() == '\r' || value.back() == '\n')) {
        value.pop_back();
      }

      form_fields[current_name] = value;
    }
  }

  void closeFileIfOpen() {
    if (file_open) {
      if (outfile.is_open())
        outfile.close();
      file_open = false;
    }
  }
};

std::vector<Part> parse_multipart(const std::string &body,
                                  const std::string &boundary) {
  std::vector<Part> parts;

  std::string full_boundary = "--" + boundary;
  std::string end_boundary = full_boundary + "--";

  size_t pos = 0;
  while (true) {
    // Find next boundary
    size_t boundary_start = body.find(full_boundary, pos);
    if (boundary_start == std::string::npos)
      break;
    size_t part_start = boundary_start + full_boundary.length();

    if (body.compare(boundary_start, end_boundary.length(), end_boundary) ==
        0) {
      // End of multipart data
      break;
    }

    // Skip possible \r\n after boundary
    if (body.compare(part_start, 2, "\r\n") == 0)
      part_start += 2;

    // Find next boundary to get part end
    size_t next_boundary = body.find(full_boundary, part_start);
    if (next_boundary == std::string::npos)
      break;

    // Extract part content
    std::string part_content =
        body.substr(part_start, next_boundary - part_start);

    // Split headers and body by \r\n\r\n
    size_t header_end = part_content.find("\r\n\r\n");
    if (header_end == std::string::npos) {
      pos = next_boundary;
      continue;
    }

    std::string headers = part_content.substr(0, header_end);
    std::string data = part_content.substr(header_end + 4);

    // Parse headers line by line
    std::istringstream header_stream(headers);
    std::string line;
    std::string part_name;
    std::string filename;

    while (std::getline(header_stream, line)) {
      if (!line.empty() && line.back() == '\r')
        line.pop_back();

      // Only parse Content-Disposition header
      if (line.find("Content-Disposition:") == 0) {
        MultipartParser::parseContentDisposition(line, part_name, filename);
      }
    }

    Part p;
    p.name = part_name;
    p.filename = filename;
    p.data.assign(data.begin(), data.end());

    parts.push_back(std::move(p));

    pos = next_boundary;
  }

  return parts;
}

std::string get_tree_json_output() {
  std::string result;
  std::array<char, 256> buffer;
  std::unique_ptr<FILE, decltype(&pclose)> pipe(
      popen("tree -J public/nas", "r"), pclose);

  if (!pipe)
    throw std::runtime_error("popen() failed!");

  while (fgets(buffer.data(), buffer.size(), pipe.get()) != nullptr) {
    result += buffer.data();
  }

  return result;
}

route("/api/folder/lists", path) {
  std::string folder = get_tree_json_output();

  Server.Response(connection, 200, "Path Lists", folder);
  return Server.Response(connection, 200, "Ok", R"({"message":"success"})");
}

route("/nas/media/view", media_view) {
  Server.static_serve("public/admin/media.htpp", connection);
  return OK(connection);
}
route("/nas/media/add", media_upload) {
  Server.static_serve("public/admin/upload.htpp", connection);
  return OK(connection);
}
route("/api/media/add", media_add) {
    std::string boundary;
    const char* content_type = mg_get_header(connection, "Content-Type");
    if (content_type != nullptr) {
        std::string ct(content_type);
        size_t boundary_pos = ct.find("boundary=");
        if (boundary_pos != std::string::npos) {
            boundary = ct.substr(boundary_pos + 9);
        }
    }
    
    if (boundary.empty()) {
        return Server.Response(connection, 400, "Bad Request",
                             R"({"message":"No boundary found in Content-Type"})");
    }
    
    MultipartParser parser(boundary);
   std::vector<char> buffer(BUFFER_SIZE);

while (true) {
    int bytes_read = mg_read(connection, buffer.data(), buffer.size());
    if (bytes_read <= 0) break;

    if (parser.parse(buffer.data(), bytes_read)) {
        break; // parsing complete
    }
}    
    std::string folder = parser.getFormField("folder");
    std::string filename = parser.getFormField("filename");
   
    if (folder.empty() || filename.empty()) {
        std::cerr << "[ERROR] Missing folder or filename field in multipart form" << std::endl;
        return Server.Response(connection, 400, "Bad Request",
                             R"({"message":"Missing folder or filename"})");
    }
    
    std::string full_folder_path = BASE_DIR + "/" + folder;
    try {
        std::filesystem::create_directories(full_folder_path);
        std::string upload_path = full_folder_path + "/" + filename;
        
        // File should already be saved by MultipartParser to uploads directory
        // Move it to the final destination
        std::filesystem::rename("./uploads/" + filename, upload_path);
        
        return Server.Response(connection, 200, "Ok",
                             R"({"message":"Upload successful"})");
    } catch (const std::exception &ex) {
        std::cerr << "[ERROR] Failed to handle upload: " << ex.what() << std::endl;
        return Server.Response(connection, 500, "Server Error",
                             R"({"message":"Failed to save uploaded file"})");
    }
}
route("/api/delete", delete_function) {
  json post_data = json::parse(Server.Read(connection));
  Model<Item> it;
  it.bind("path", &Item::path);
  auto it_final = it.parse_one(post_data);
  std::string final_path = "rm " + BASE_DIR + it_final.path;
  system(final_path.c_str());
  return OK(connection);
}

route("/api/mkdir", mkdirs) {
  json post_data = json::parse(Server.Read(connection));
  Model<Item> it;
  it.bind("path", &Item::path);
  auto it_final = it.parse_one(post_data);
  std::string final_path = "mkdir -p " + BASE_DIR + "/" + it_final.path;
  system(final_path.c_str());
  return OK(connection);
}

route("/api/rmdir", rmdir) {
  json post_data = json::parse(Server.Read(connection));
  Model<Item> it;
  it.bind("path", &Item::path);
  auto it_final = it.parse_one(post_data);
  std::string final_path = "rm -r " + BASE_DIR + "/" + it_final.path;
  system(final_path.c_str());
  return OK(connection);
}
