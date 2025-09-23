#include "handler.hpp"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include <unordered_map>
#include "../models/nas.hpp"
using namespace nlohmann;

constexpr size_t BUFFER_SIZE = 8192;
std::string BASE_DIR = "public/nas";
struct Part {
  std::string name;
  std::string filename; // optional
  std::vector<char> data;
};

class MultipartParser {
public:
  MultipartParser(const std::string &boundary)
      : boundary_str("--" + boundary), close_boundary("--" + boundary + "--"),
        state(State::EXPECT_BOUNDARY), file_open(false) {}

  // Call this repeatedly as you read chunks from the socket
  // data points to buffer, length is bytes read
  // Returns true if finished parsing all parts
  bool parse(const char *data, size_t length) {
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

  // Get parsed form field value by name
  const std::string &getFormField(const std::string &name) const {
    static const std::string empty;
    auto it = form_fields.find(name);
    return it != form_fields.end() ? it->second : empty;
  }

  // Helper: trim spaces
  static std::string trim(const std::string &s) {
    size_t start = 0;
    while (start < s.size() && std::isspace(s[start]))
      ++start;
    size_t end = s.size();
    while (end > start && std::isspace(s[end - 1]))
      --end;
    return s.substr(start, end - start);
  }
  static void parseContentDisposition(const std::string &val, std::string &name,
                                      std::string &filename) {
    name.clear();
    filename.clear();

    size_t pos = val.find(';');
    if (pos == std::string::npos) {
      // just disposition type, ignore
      return;
    }

    std::string params = val.substr(pos + 1);
    size_t start = 0;
    while (start < params.size()) {
      // parse param name=value pairs
      // format param=value or param="value"
      size_t eq = params.find('=', start);
      if (eq == std::string::npos)
        break;
      std::string param_name = trim(params.substr(start, eq - start));
      size_t val_start = eq + 1;
      std::string param_value;
      if (params[val_start] == '"') {
        size_t val_end = params.find('"', val_start + 1);
        if (val_end == std::string::npos)
          break;
        param_value = params.substr(val_start + 1, val_end - val_start - 1);
        start = val_end + 1;
      } else {
        size_t val_end = params.find(';', val_start);
        if (val_end == std::string::npos) {
          param_value = trim(params.substr(val_start));
          start = params.size();
        } else {
          param_value = trim(params.substr(val_start, val_end - val_start));
          start = val_end + 1;
        }
      }

      if (param_name == "name")
        name = param_value;
      else if (param_name == "filename")
        filename = param_value;
    }
  }

private:
  enum class State { EXPECT_BOUNDARY, READ_HEADERS, READ_DATA, DONE };

  std::string buffer;
  const std::string boundary_str;
  const std::string close_boundary;
  State state;

  // Current part headers and data info
  std::unordered_map<std::string, std::string> current_headers;
  std::string current_name;
  std::string current_filename;

  bool file_open;
  std::ofstream outfile;

  std::unordered_map<std::string, std::string> form_fields;

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
        auto it = current_headers.find("Content-Disposition");
        if (it != current_headers.end()) {
          parseContentDisposition(it->second, current_name, current_filename);
        }
        if (!current_filename.empty()) {
          // file part - open file for writing
          std::string filepath =
              "./uploads/" + current_filename; // make sure directory exists
          outfile.open(filepath, std::ios::binary);
          if (!outfile.is_open()) {
            std::cerr << "Error opening file for writing: " << filepath << "\n";
            state = State::DONE;
            return false;
          }
          file_open = true;
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
    if (file_open) {
      outfile.write(data, len);
      if (!outfile) {
        std::cerr << "Error writing to file\n";
        state = State::DONE;
      }
    } else {
      // Accumulate to form field if current_name is set and no filename (normal
      // form field)
      if (!current_name.empty() && current_filename.empty()) {
        form_fields[current_name].append(data, len);
      }
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
  const char *content_type_cstr = mg_get_header(connection, "Content-Type");
  if (!content_type_cstr) {
    return Server.Response(connection, 400, "Bad Request",
                           R"({"message":"Missing Content-Type"})");
  }

  std::string content_type = content_type_cstr;
  std::string boundary;

  size_t bpos = content_type.find("boundary=");
  if (bpos == std::string::npos) {
    return Server.Response(connection, 400, "Bad Request",
                           R"({"message":"No boundary in Content-Type"})");
  }
  boundary = content_type.substr(bpos + 9); // extract boundary

  const char *content_length_str = mg_get_header(connection, "Content-Length");
  if (!content_length_str) {
    return Server.Response(connection, 411, "Length Required",
                           R"({"message":"Missing Content-Length"})");
  }

  size_t content_length = std::stoul(content_length_str);
  std::vector<char> body(content_length);

  size_t total_read = 0;
  while (total_read < content_length) {
    int r = mg_read(connection, body.data() + total_read,
                    content_length - total_read);
    if (r <= 0) {
      return Server.Response(connection, 400, "Bad Request",
                             R"({"message":"Incomplete request body"})");
    }
    total_read += r;
  }

  std::string body_str(body.begin(), body.end());

  auto parts = parse_multipart(body_str, boundary);

  std::string folder_path;
  std::string filename;
  std::vector<char> file_data;

  for (const auto &p : parts) {
    if (p.name == "folder") {
      folder_path =
          MultipartParser::trim(std::string(p.data.begin(), p.data.end()));
    } else if (p.name == "filename") {
      filename =
          MultipartParser::trim(std::string(p.data.begin(), p.data.end()));
    } else if (p.name == "file") {
      file_data = p.data;
      if (!p.filename.empty()) {
        filename = p.filename;
      }
    }
  }

  if (folder_path.empty() || filename.empty() || file_data.empty()) {
    return Server.Response(
        connection, 400, "Bad Request",
        R"({"message":"Missing file or folder or filename"})");
  }

  filename = std::filesystem::path(filename).filename().string();
  std::string full_folder_path = BASE_DIR + "/" + folder_path;

  try {
    std::filesystem::create_directories(full_folder_path);

    std::string full_path = full_folder_path + "/" + filename;
    std::ofstream out(full_path, std::ios::binary);
    if (!out.is_open()) {
      return Server.Response(
          connection, 500, "Server Error",
          R"({"message":"Failed to open file for writing"})");
    }
    out.write(file_data.data(), file_data.size());
    out.close();
  } catch (const std::exception &ex) {
    return Server.Response(connection, 500, "Server Error",
                           R"({"message":"Exception while saving file"})");
  }

  return Server.Response(connection, 200, "Ok",
                         R"({"message":"Upload successful"})");
}

route("/api/delete", delete_function) {
  json post_data = json::parse(Server.Read(connection));
  Model<Item> it;
  it.bind("path",&Item::path);
  auto it_final = it.parse_one(post_data);
  std::string final_path = "rm "+ BASE_DIR + it_final.path;
  system(final_path.c_str());
  return OK(connection);
}

route("/api/mkdir",mkdirs){
  json post_data = json::parse(Server.Read(connection));
  Model<Item> it;
  it.bind("path", &Item::path);
  auto it_final = it.parse_one(post_data);
  std::string final_path = "mkdir -p "+BASE_DIR+"/"+it_final.path;
  system(final_path.c_str());
  return OK(connection);
}


route("/api/rmdir",rmdir){
  json post_data = json::parse(Server.Read(connection));
  Model<Item> it;
  it.bind("path", &Item::path);
  auto it_final = it.parse_one(post_data);
  std::string final_path = "rm -r "+BASE_DIR+"/"+it_final.path;
  system(final_path.c_str());
  return OK(connection);
}
