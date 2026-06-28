#include <algorithm>
#include <cctype>
#include <iostream>
#include <iterator>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <vector>

struct Transition {
  std::string present;
  std::string input;
  std::string next;
  std::string output;
};

struct InferenceStep {
  int index = 0;
  Transition transition;
  std::string action;
};

struct StateSplit {
  int index = 0;
  std::string original_state;
  std::string new_state;
  std::string reason;
};

struct InferenceConflict {
  int index = 0;
  std::string present_state;
  std::string input;
  std::string previous_output;
  std::string current_output;
  std::string previous_next_state;
  std::string required_next_state;
  std::string reason;
};

struct TimingInference {
  bool ok = false;
  std::string message;
  int inferred_state_count = 0;
  std::vector<std::string> states;
  std::vector<Transition> transitions;
  std::vector<Transition> observed_transitions;
  std::vector<std::string> state_path;
  std::vector<InferenceStep> steps;
  std::vector<StateSplit> state_splits;
  std::vector<InferenceConflict> conflicts;
};

struct TruthRow {
  std::string bits;
  std::string value;
};

struct Implicant {
  std::string pattern;
  std::set<std::string> cells;
};

struct KMapLayout {
  std::vector<std::string> rows;
  std::vector<std::string> cols;
};

struct EquationResult {
  std::string name;
  std::string target;
  std::string kind;
  std::string ff_type;
  std::string state_bit;
  std::string pin;
  std::string expression;
  std::vector<std::string> variables;
  std::vector<TruthRow> truth_rows;
  std::vector<Implicant> groups;
};

struct Node {
  std::string id;
  std::string type;
  std::string label;
  int x;
  int y;
  std::vector<std::string> pins;
};

struct Edge {
  std::string from;
  std::string to;
  std::string label;
};

std::string trim(const std::string& value) {
  std::size_t start = 0;
  while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start]))) {
    start += 1;
  }
  std::size_t end = value.size();
  while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    end -= 1;
  }
  return value.substr(start, end - start);
}

std::string jsonEscape(const std::string& value) {
  std::ostringstream out;
  for (char c : value) {
    switch (c) {
      case '\\':
        out << "\\\\";
        break;
      case '"':
        out << "\\\"";
        break;
      case '\n':
        out << "\\n";
        break;
      case '\r':
        out << "\\r";
        break;
      case '\t':
        out << "\\t";
        break;
      default:
        out << c;
    }
  }
  return out.str();
}

void writeJsonString(std::ostream& out, const std::string& value) {
  out << '"' << jsonEscape(value) << '"';
}

void writeStringArray(std::ostream& out, const std::vector<std::string>& values) {
  out << "[";
  for (std::size_t i = 0; i < values.size(); i += 1) {
    if (i) out << ",";
    writeJsonString(out, values[i]);
  }
  out << "]";
}

void writeIntArray(std::ostream& out, const std::vector<int>& values) {
  out << "[";
  for (std::size_t i = 0; i < values.size(); i += 1) {
    if (i) out << ",";
    out << values[i];
  }
  out << "]";
}

std::size_t findMatching(const std::string& input, std::size_t open_pos, char open_char, char close_char) {
  bool in_string = false;
  bool escaped = false;
  int depth = 0;
  for (std::size_t i = open_pos; i < input.size(); i += 1) {
    const char c = input[i];
    if (in_string) {
      if (escaped) {
        escaped = false;
      } else if (c == '\\') {
        escaped = true;
      } else if (c == '"') {
        in_string = false;
      }
      continue;
    }

    if (c == '"') {
      in_string = true;
    } else if (c == open_char) {
      depth += 1;
    } else if (c == close_char) {
      depth -= 1;
      if (depth == 0) return i;
    }
  }
  return std::string::npos;
}

std::size_t findKeyColon(const std::string& input, const std::string& key) {
  const std::string token = "\"" + key + "\"";
  const std::size_t key_pos = input.find(token);
  if (key_pos == std::string::npos) return std::string::npos;
  return input.find(':', key_pos + token.size());
}

std::string extractJsonString(const std::string& input, const std::string& key, const std::string& fallback) {
  const std::size_t colon_pos = findKeyColon(input, key);
  if (colon_pos == std::string::npos) return fallback;
  const std::size_t quote_start = input.find('"', colon_pos + 1);
  if (quote_start == std::string::npos) return fallback;
  std::size_t quote_end = quote_start + 1;
  bool escaped = false;
  while (quote_end < input.size()) {
    const char c = input[quote_end];
    if (escaped) {
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      return input.substr(quote_start + 1, quote_end - quote_start - 1);
    }
    quote_end += 1;
  }
  return fallback;
}

int extractJsonInt(const std::string& input, const std::string& key, int fallback) {
  const std::size_t colon_pos = findKeyColon(input, key);
  if (colon_pos == std::string::npos) return fallback;
  std::size_t value_start = input.find_first_of("-0123456789", colon_pos + 1);
  if (value_start == std::string::npos) return fallback;
  std::size_t value_end = value_start;
  while (value_end < input.size() &&
         (std::isdigit(static_cast<unsigned char>(input[value_end])) || input[value_end] == '-')) {
    value_end += 1;
  }
  try {
    return std::stoi(input.substr(value_start, value_end - value_start));
  } catch (...) {
    return fallback;
  }
}

std::string extractArraySlice(const std::string& input, const std::string& key) {
  const std::size_t colon_pos = findKeyColon(input, key);
  if (colon_pos == std::string::npos) return "";
  const std::size_t open_pos = input.find('[', colon_pos + 1);
  if (open_pos == std::string::npos) return "";
  const std::size_t close_pos = findMatching(input, open_pos, '[', ']');
  if (close_pos == std::string::npos) return "";
  return input.substr(open_pos, close_pos - open_pos + 1);
}

std::string extractObjectSlice(const std::string& input, const std::string& key) {
  const std::size_t colon_pos = findKeyColon(input, key);
  if (colon_pos == std::string::npos) return "";
  const std::size_t open_pos = input.find('{', colon_pos + 1);
  if (open_pos == std::string::npos) return "";
  const std::size_t close_pos = findMatching(input, open_pos, '{', '}');
  if (close_pos == std::string::npos) return "";
  return input.substr(open_pos, close_pos - open_pos + 1);
}

std::vector<std::string> parseStringArray(const std::string& array_slice) {
  std::vector<std::string> values;
  bool in_string = false;
  bool escaped = false;
  std::string current;
  for (std::size_t i = 0; i < array_slice.size(); i += 1) {
    const char c = array_slice[i];
    if (!in_string) {
      if (c == '"') {
        in_string = true;
        current.clear();
      }
      continue;
    }

    if (escaped) {
      current.push_back(c);
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      values.push_back(current);
      in_string = false;
    } else {
      current.push_back(c);
    }
  }
  return values;
}

std::vector<std::string> extractStringArray(const std::string& input, const std::string& key) {
  return parseStringArray(extractArraySlice(input, key));
}

std::vector<std::string> extractTimingTraceValues(const std::string& input, const std::string& key) {
  const std::string trace_object = extractObjectSlice(input, "timing_trace");
  if (trace_object.empty()) return {};
  return extractStringArray(trace_object, key);
}

std::vector<std::string> parseObjectSlices(const std::string& array_slice) {
  std::vector<std::string> objects;
  bool in_string = false;
  bool escaped = false;
  int depth = 0;
  std::size_t object_start = std::string::npos;
  for (std::size_t i = 0; i < array_slice.size(); i += 1) {
    const char c = array_slice[i];
    if (in_string) {
      if (escaped) {
        escaped = false;
      } else if (c == '\\') {
        escaped = true;
      } else if (c == '"') {
        in_string = false;
      }
      continue;
    }

    if (c == '"') {
      in_string = true;
    } else if (c == '{') {
      if (depth == 0) object_start = i;
      depth += 1;
    } else if (c == '}') {
      depth -= 1;
      if (depth == 0 && object_start != std::string::npos) {
        objects.push_back(array_slice.substr(object_start, i - object_start + 1));
        object_start = std::string::npos;
      }
    }
  }
  return objects;
}

std::vector<Transition> parseTransitions(const std::string& input) {
  std::vector<Transition> transitions;
  for (const std::string& object : parseObjectSlices(extractArraySlice(input, "transitions"))) {
    transitions.push_back({
      extractJsonString(object, "present_state", ""),
      extractJsonString(object, "input", ""),
      extractJsonString(object, "next_state", ""),
      extractJsonString(object, "output", ""),
    });
  }
  return transitions;
}

std::string stateNameForIndex(int index);

bool isBinaryTrace(const std::vector<std::string>& values) {
  for (const std::string& value : values) {
    if (value != "0" && value != "1") return false;
  }
  return true;
}

TimingInference inferTimingTrace(
  const std::vector<std::string>& x_values,
  const std::vector<std::string>& z_values,
  const std::string& fsm_model,
  int configured_state_count
) {
  TimingInference result;
  if (x_values.size() != z_values.size()) {
    result.message = "Timing Trace X/Z length mismatch";
    return result;
  }
  if (x_values.size() < 2) {
    result.message = "Timing Trace requires at least 2 samples";
    return result;
  }
  if (!isBinaryTrace(x_values) || !isBinaryTrace(z_values)) {
    result.message = "Timing Trace contains non-binary value";
    return result;
  }

  TimingInference last_failure;
  bool has_failure = false;
  const int diagnostic_limit = std::max(configured_state_count, std::min(static_cast<int>(x_values.size()), 8));

  for (int candidate_count = 1; candidate_count <= diagnostic_limit; candidate_count += 1) {
    TimingInference candidate;
    candidate.inferred_state_count = candidate_count;
    bool deterministic = true;
    std::map<std::string, Transition> transition_by_key;
    std::map<std::string, std::string> moore_output_by_state;
    std::vector<Transition> observed;
    std::vector<std::string> state_path;

    for (std::size_t i = 0; i < x_values.size(); i += 1) {
      const std::string present = stateNameForIndex(static_cast<int>(i % candidate_count));
      const std::string next = stateNameForIndex(static_cast<int>((i + 1) % candidate_count));
      const Transition transition{present, x_values[i], next, z_values[i]};
      observed.push_back(transition);
      state_path.push_back(present);

      const std::string key = present + "|" + x_values[i];
      if (transition_by_key.count(key)) {
        const Transition& previous = transition_by_key[key];
        if (previous.next != next || previous.output != z_values[i]) {
          candidate.steps.push_back({static_cast<int>(i), transition, "conflict"});
          candidate.conflicts.push_back({
            static_cast<int>(i),
            present,
            x_values[i],
            previous.output,
            z_values[i],
            previous.next,
            next,
            "same present_state/input requires different output or next_state",
          });
          deterministic = false;
          break;
        }
        candidate.steps.push_back({static_cast<int>(i), transition, "reuse_transition"});
      } else {
        transition_by_key[key] = transition;
        candidate.steps.push_back({static_cast<int>(i), transition, "create_transition"});
      }

      if (fsm_model == "Moore") {
        if (moore_output_by_state.count(present) && moore_output_by_state[present] != z_values[i]) {
          candidate.steps.back().action = "conflict";
          candidate.conflicts.push_back({
            static_cast<int>(i),
            present,
            x_values[i],
            moore_output_by_state[present],
            z_values[i],
            transition_by_key[key].next,
            next,
            "same Moore state requires different output",
          });
          deterministic = false;
          break;
        }
        moore_output_by_state[present] = z_values[i];
      }
    }

    candidate.observed_transitions = observed;
    candidate.state_path = state_path;
    for (int index = 1; index < candidate_count; index += 1) {
      candidate.state_splits.push_back({
        index,
        "S0",
        stateNameForIndex(index),
        "additional observed context state used to preserve deterministic trace",
      });
    }

    if (!deterministic) {
      if (candidate_count <= configured_state_count) {
        last_failure = candidate;
        has_failure = true;
      }
      continue;
    }

    std::vector<std::string> states;
    for (int index = 0; index < candidate_count; index += 1) {
      states.push_back(stateNameForIndex(index));
    }

    for (const std::string& state : states) {
      for (const std::string& x : {"0", "1"}) {
        const std::string key = state + "|" + x;
        if (!transition_by_key.count(key)) {
          const std::string output = fsm_model == "Moore" && moore_output_by_state.count(state)
            ? moore_output_by_state[state]
            : "0";
          transition_by_key[key] = {state, x, state, output};
        }
      }
    }

    result = candidate;
    result.ok = candidate_count <= configured_state_count;
    result.inferred_state_count = candidate_count;
    result.states = states;
    for (const auto& item : transition_by_key) {
      result.transitions.push_back(item.second);
    }
    if (candidate_count <= configured_state_count) {
      return result;
    }

    TimingInference failure = has_failure ? last_failure : result;
    failure.ok = false;
    failure.message = fsm_model == "Moore"
      ? "Timing Trace Moore inference requires more states than configured"
      : "Timing Trace requires more states than configured";
    failure.inferred_state_count = candidate_count;
    return failure;
  }

  result = has_failure ? last_failure : result;
  result.ok = false;
  result.inferred_state_count = std::max(configured_state_count + 1, result.inferred_state_count);
  result.message = fsm_model == "Moore"
    ? "Timing Trace Moore inference requires more states than configured"
    : "Timing Trace requires more states than configured";
  return result;
}

std::string stateNameForIndex(int index) {
  return "S" + std::to_string(index);
}

int stateIndex(const std::string& state) {
  if (state.size() < 2 || state[0] != 'S') return -1;
  for (std::size_t i = 1; i < state.size(); i += 1) {
    if (!std::isdigit(static_cast<unsigned char>(state[i]))) return -1;
  }
  return std::stoi(state.substr(1));
}

std::string aliasForIndex(int index) {
  std::string label;
  int value = index + 1;
  while (value > 0) {
    int remainder = (value - 1) % 26;
    label.insert(label.begin(), static_cast<char>('A' + remainder));
    value = (value - 1) / 26;
  }
  return label;
}

std::string bitName(int index) {
  return "Q_" + aliasForIndex(index);
}

int stateBitCount(int state_count) {
  int bits = 0;
  int capacity = 1;
  while (capacity < state_count) {
    bits += 1;
    capacity <<= 1;
  }
  return std::max(1, bits);
}

std::string binaryForIndex(int index, int bits) {
  std::string result(bits, '0');
  for (int bit = bits - 1; bit >= 0; bit -= 1) {
    result[bit] = (index & 1) ? '1' : '0';
    index >>= 1;
  }
  return result;
}

bool patternMatches(const std::string& pattern, const std::string& bits) {
  if (pattern.size() != bits.size()) return false;
  for (std::size_t i = 0; i < pattern.size(); i += 1) {
    if (pattern[i] != '-' && pattern[i] != bits[i]) return false;
  }
  return true;
}

bool canMerge(const std::string& a, const std::string& b, std::string& merged) {
  int differences = 0;
  merged = a;
  for (std::size_t i = 0; i < a.size(); i += 1) {
    if (a[i] == b[i]) continue;
    if (a[i] == '-' || b[i] == '-') return false;
    differences += 1;
    merged[i] = '-';
  }
  return differences == 1;
}

bool isPowerOfTwo(int value) {
  return value > 0 && (value & (value - 1)) == 0;
}

std::vector<std::string> allBitStrings(int count);

KMapLayout layoutForVariableCount(int variable_count) {
  if (variable_count == 1) {
    return {{"0"}, {"0", "1"}};
  }
  if (variable_count == 2) {
    return {{"0", "1"}, {"0", "1"}};
  }
  if (variable_count == 3) {
    return {{"0", "1"}, {"00", "01", "11", "10"}};
  }
  if (variable_count == 4) {
    return {{"00", "01", "11", "10"}, {"00", "01", "11", "10"}};
  }
  return { {""}, allBitStrings(variable_count) };
}

std::string mintermForPosition(const std::string& row, const std::string& col, int variable_count) {
  if (variable_count == 1) return col;
  return row + col;
}

std::string keyForCells(const std::set<std::string>& cells) {
  std::ostringstream out;
  bool first = true;
  for (const std::string& cell : cells) {
    if (!first) out << ",";
    first = false;
    out << cell;
  }
  return out.str();
}

std::string patternFromCells(const std::set<std::string>& cells, int variable_count) {
  std::string pattern(variable_count, '-');
  for (int bit = 0; bit < variable_count; bit += 1) {
    char first = 0;
    bool same = true;
    for (const std::string& cell : cells) {
      if (cell.size() <= static_cast<std::size_t>(bit)) {
        same = false;
        break;
      }
      if (first == 0) first = cell[bit];
      if (cell[bit] != first) same = false;
    }
    if (same && first != 0) pattern[bit] = first;
  }
  return pattern;
}

int literalCount(const std::string& pattern) {
  return static_cast<int>(std::count_if(pattern.begin(), pattern.end(), [](char bit) { return bit != '-'; }));
}

std::vector<Implicant> dedupeImplicants(const std::vector<Implicant>& items) {
  std::map<std::string, Implicant> by_pattern;
  for (const Implicant& item : items) {
    Implicant& target = by_pattern[item.pattern];
    target.pattern = item.pattern;
    target.cells.insert(item.cells.begin(), item.cells.end());
  }
  std::vector<Implicant> result;
  for (const auto& entry : by_pattern) {
    result.push_back(entry.second);
  }
  return result;
}

std::vector<Implicant> minimizeRows(const std::vector<TruthRow>& rows) {
  if (rows.empty()) return {};

  const int variable_count = static_cast<int>(rows[0].bits.size());
  if (variable_count > 4) {
    std::vector<Implicant> canonical;
    for (const TruthRow& row : rows) {
      if (row.value == "1") {
        canonical.push_back({row.bits, {row.bits}});
      }
    }
    return canonical;
  }

  std::map<std::string, std::string> value_by_bits;
  std::set<std::string> one_cells;
  for (const TruthRow& row : rows) {
    value_by_bits[row.bits] = row.value;
    if (row.value == "1") {
      one_cells.insert(row.bits);
    }
  }

  if (one_cells.empty()) return {};

  const KMapLayout layout = layoutForVariableCount(variable_count);
  std::map<std::string, Implicant> candidates_by_cells;
  const int row_count = static_cast<int>(layout.rows.size());
  const int col_count = static_cast<int>(layout.cols.size());

  for (int height = 1; height <= row_count; height *= 2) {
    for (int width = 1; width <= col_count; width *= 2) {
      const int area = height * width;
      if (!isPowerOfTwo(area)) continue;
      for (int row_start = 0; row_start < row_count; row_start += 1) {
        for (int col_start = 0; col_start < col_count; col_start += 1) {
          std::set<std::string> group_cells;
          bool has_zero = false;
          bool has_one = false;
          for (int dr = 0; dr < height; dr += 1) {
            for (int dc = 0; dc < width; dc += 1) {
              const std::string minterm = mintermForPosition(
                layout.rows[(row_start + dr) % row_count],
                layout.cols[(col_start + dc) % col_count],
                variable_count
              );
              const std::string value = value_by_bits[minterm];
              if (value == "0" || value.empty()) has_zero = true;
              if (value == "1") has_one = true;
              group_cells.insert(minterm);
            }
          }
          if (has_zero || !has_one || static_cast<int>(group_cells.size()) != area) continue;
          candidates_by_cells[keyForCells(group_cells)] = {
            patternFromCells(group_cells, variable_count),
            group_cells,
          };
        }
      }
    }
  }

  std::vector<Implicant> candidates;
  for (const auto& entry : candidates_by_cells) {
    candidates.push_back(entry.second);
  }
  std::sort(candidates.begin(), candidates.end(), [](const Implicant& a, const Implicant& b) {
    if (a.cells.size() != b.cells.size()) return a.cells.size() > b.cells.size();
    if (literalCount(a.pattern) != literalCount(b.pattern)) return literalCount(a.pattern) < literalCount(b.pattern);
    return a.pattern < b.pattern;
  });

  std::vector<Implicant> selected;
  std::set<std::string> selected_keys;
  std::set<std::string> uncovered = one_cells;

  for (const std::string& one : one_cells) {
    std::vector<std::size_t> covering;
    for (std::size_t i = 0; i < candidates.size(); i += 1) {
      if (candidates[i].cells.count(one)) covering.push_back(i);
    }
    if (covering.size() == 1) {
      const Implicant& essential = candidates[covering[0]];
      const std::string key = keyForCells(essential.cells);
      if (!selected_keys.count(key)) {
        selected.push_back(essential);
        selected_keys.insert(key);
      }
      for (const std::string& cell : essential.cells) {
        uncovered.erase(cell);
      }
    }
  }

  while (!uncovered.empty()) {
    int best_cover = -1;
    std::size_t best_index = candidates.size();
    for (std::size_t i = 0; i < candidates.size(); i += 1) {
      const std::string key = keyForCells(candidates[i].cells);
      if (selected_keys.count(key)) continue;
      int cover = 0;
      for (const std::string& cell : uncovered) {
        if (candidates[i].cells.count(cell)) cover += 1;
      }
      if (
        cover > best_cover ||
        (cover == best_cover && best_index != candidates.size() && candidates[i].cells.size() > candidates[best_index].cells.size()) ||
        (cover == best_cover && best_index != candidates.size() && candidates[i].cells.size() == candidates[best_index].cells.size() &&
         literalCount(candidates[i].pattern) < literalCount(candidates[best_index].pattern))
      ) {
        best_cover = cover;
        best_index = i;
      }
    }
    if (best_index == candidates.size() || best_cover <= 0) break;
    selected.push_back(candidates[best_index]);
    selected_keys.insert(keyForCells(candidates[best_index].cells));
    for (const std::string& cell : candidates[best_index].cells) {
      uncovered.erase(cell);
    }
  }

  for (auto it = selected.begin(); it != selected.end();) {
    std::set<std::string> covered_without;
    for (auto other = selected.begin(); other != selected.end(); ++other) {
      if (other == it) continue;
      for (const std::string& cell : other->cells) {
        if (one_cells.count(cell)) covered_without.insert(cell);
      }
    }
    bool redundant = true;
    for (const std::string& one : one_cells) {
      if (!covered_without.count(one)) {
        redundant = false;
        break;
      }
    }
    if (redundant) {
      it = selected.erase(it);
    } else {
      ++it;
    }
  }

  return selected;
}

std::string termFromPattern(const std::vector<std::string>& variables, const std::string& pattern) {
  std::string term;
  for (std::size_t i = 0; i < pattern.size(); i += 1) {
    if (pattern[i] == '-') continue;
    term += variables[i];
    if (pattern[i] == '0') term += "#";
  }
  return term.empty() ? "1" : term;
}

std::string expressionFromGroups(const std::vector<std::string>& variables, const std::vector<Implicant>& groups) {
  if (groups.empty()) return "0";
  std::vector<std::string> terms;
  for (const Implicant& group : groups) {
    terms.push_back(termFromPattern(variables, group.pattern));
  }
  std::sort(terms.begin(), terms.end(), [](const std::string& a, const std::string& b) {
    std::string left = a;
    std::string right = b;
    std::replace(left.begin(), left.end(), '#', '~');
    std::replace(right.begin(), right.end(), '#', '~');
    return left < right;
  });
  terms.erase(std::unique(terms.begin(), terms.end()), terms.end());
  std::ostringstream out;
  for (std::size_t i = 0; i < terms.size(); i += 1) {
    if (i) out << " + ";
    out << terms[i];
  }
  return out.str();
}

std::vector<std::string> allBitStrings(int count) {
  std::vector<std::string> values;
  const int total = 1 << count;
  for (int i = 0; i < total; i += 1) {
    values.push_back(binaryForIndex(i, count));
  }
  return values;
}

std::vector<std::string> splitTerms(const std::string& expression) {
  std::vector<std::string> terms;
  std::size_t start = 0;
  while (start <= expression.size()) {
    const std::size_t plus = expression.find('+', start);
    const std::size_t end = plus == std::string::npos ? expression.size() : plus;
    terms.push_back(trim(expression.substr(start, end - start)));
    if (plus == std::string::npos) break;
    start = plus + 1;
  }
  return terms;
}

std::vector<std::string> parseLiterals(const std::string& term, std::vector<std::string> variables) {
  std::sort(variables.begin(), variables.end(), [](const std::string& a, const std::string& b) {
    return a.size() > b.size();
  });
  std::vector<std::string> literals;
  std::size_t pos = 0;
  while (pos < term.size()) {
    if (std::isspace(static_cast<unsigned char>(term[pos]))) {
      pos += 1;
      continue;
    }
    bool matched = false;
    for (const std::string& variable : variables) {
      if (term.compare(pos, variable.size(), variable) == 0) {
        std::string literal = variable;
        pos += variable.size();
        if (pos < term.size() && term[pos] == '#') {
          literal += "#";
          pos += 1;
        }
        literals.push_back(literal);
        matched = true;
        break;
      }
    }
    if (!matched) {
      pos += 1;
    }
  }
  return literals;
}

int indexFromBits(const std::string& bits) {
  int value = 0;
  for (char bit : bits) {
    value <<= 1;
    if (bit == '1') value += 1;
  }
  return value;
}

bool evaluateExpression(const std::string& expression, const std::vector<std::string>& variables, const std::string& bits) {
  const std::string text = trim(expression);
  if (text == "1") return true;
  if (text.empty() || text == "0") return false;

  for (const std::string& term : splitTerms(text)) {
    if (term == "1") return true;
    if (term.empty() || term == "0") continue;
    bool term_matches = true;
    for (const std::string& literal : parseLiterals(term, variables)) {
      const bool inverted = literal.back() == '#';
      const std::string variable = inverted ? literal.substr(0, literal.size() - 1) : literal;
      const auto found = std::find(variables.begin(), variables.end(), variable);
      if (found == variables.end()) {
        term_matches = false;
        break;
      }
      const std::size_t index = static_cast<std::size_t>(found - variables.begin());
      if (index >= bits.size()) {
        term_matches = false;
        break;
      }
      const char expected = inverted ? '0' : '1';
      if (bits[index] != expected) {
        term_matches = false;
        break;
      }
    }
    if (term_matches) return true;
  }

  return false;
}

bool hasSrIllegalOverlap(
  const EquationResult& s_equation,
  const EquationResult& r_equation,
  int state_count
) {
  for (const TruthRow& row : s_equation.truth_rows) {
    if (row.bits.size() < 2) continue;
    const int present_index = indexFromBits(row.bits.substr(1));
    if (present_index >= state_count) continue;
    const bool s_value = evaluateExpression(s_equation.expression, s_equation.variables, row.bits);
    const bool r_value = evaluateExpression(r_equation.expression, r_equation.variables, row.bits);
    if (s_value && r_value) return true;
  }
  return false;
}

std::string srExcitationValue(const std::string& pin, char present_bit, char next_bit, bool conservative) {
  if (pin == "S") {
    if (present_bit == '0') return next_bit == '1' ? "1" : "0";
    return (!conservative && next_bit == '1') ? "X" : "0";
  }

  if (present_bit == '1') return next_bit == '0' ? "1" : "0";
  return (!conservative && next_bit == '0') ? "X" : "0";
}

std::string sanitizeId(const std::string& value) {
  std::string result;
  for (char c : value) {
    if (std::isalnum(static_cast<unsigned char>(c))) {
      result.push_back(c);
    } else if (c == '#') {
      result += "not";
    } else {
      result.push_back('_');
    }
  }
  return result;
}

void emitError(const std::string& message) {
  std::cout << "{\"status\":\"ERROR\",\"message\":";
  writeJsonString(std::cout, message);
  std::cout << "}";
}

void writeTruthTable(std::ostream& out, const EquationResult& equation) {
  out << "[";
  for (std::size_t i = 0; i < equation.truth_rows.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    for (std::size_t j = 0; j < equation.variables.size(); j += 1) {
      if (j) out << ",";
      writeJsonString(out, equation.variables[j]);
      out << ":";
      writeJsonString(out, std::string(1, equation.truth_rows[i].bits[j]));
    }
    if (!equation.variables.empty()) out << ",";
    out << "\"value\":";
    writeJsonString(out, equation.truth_rows[i].value);
    out << "}";
  }
  out << "]";
}

void writeTransitionsArray(std::ostream& out, const std::vector<Transition>& transitions) {
  out << "[";
  for (std::size_t i = 0; i < transitions.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    out << "\"present_state\":";
    writeJsonString(out, transitions[i].present);
    out << ",\"input\":";
    writeJsonString(out, transitions[i].input);
    out << ",\"next_state\":";
    writeJsonString(out, transitions[i].next);
    out << ",\"output\":";
    writeJsonString(out, transitions[i].output);
    out << "}";
  }
  out << "]";
}

void writeInferenceSteps(std::ostream& out, const std::vector<InferenceStep>& steps) {
  out << "[";
  for (std::size_t i = 0; i < steps.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    out << "\"index\":" << steps[i].index;
    out << ",\"present_state\":";
    writeJsonString(out, steps[i].transition.present);
    out << ",\"input\":";
    writeJsonString(out, steps[i].transition.input);
    out << ",\"output\":";
    writeJsonString(out, steps[i].transition.output);
    out << ",\"next_state\":";
    writeJsonString(out, steps[i].transition.next);
    out << ",\"action\":";
    writeJsonString(out, steps[i].action);
    out << "}";
  }
  out << "]";
}

void writeStateSplits(std::ostream& out, const std::vector<StateSplit>& splits) {
  out << "[";
  for (std::size_t i = 0; i < splits.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    out << "\"index\":" << splits[i].index;
    out << ",\"original_state\":";
    writeJsonString(out, splits[i].original_state);
    out << ",\"new_state\":";
    writeJsonString(out, splits[i].new_state);
    out << ",\"reason\":";
    writeJsonString(out, splits[i].reason);
    out << "}";
  }
  out << "]";
}

void writeConflicts(std::ostream& out, const std::vector<InferenceConflict>& conflicts) {
  out << "[";
  for (std::size_t i = 0; i < conflicts.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    out << "\"index\":" << conflicts[i].index;
    out << ",\"present_state\":";
    writeJsonString(out, conflicts[i].present_state);
    out << ",\"input\":";
    writeJsonString(out, conflicts[i].input);
    out << ",\"previous_output\":";
    writeJsonString(out, conflicts[i].previous_output);
    out << ",\"current_output\":";
    writeJsonString(out, conflicts[i].current_output);
    out << ",\"previous_next_state\":";
    writeJsonString(out, conflicts[i].previous_next_state);
    out << ",\"required_next_state\":";
    writeJsonString(out, conflicts[i].required_next_state);
    out << ",\"reason\":";
    writeJsonString(out, conflicts[i].reason);
    out << "}";
  }
  out << "]";
}

void writeInferenceReport(std::ostream& out, const TimingInference& inference) {
  out << "{";
  out << "\"steps\":";
  writeInferenceSteps(out, inference.steps);
  out << ",\"state_splits\":";
  writeStateSplits(out, inference.state_splits);
  out << ",\"conflicts\":";
  writeConflicts(out, inference.conflicts);
  out << ",\"inferred_transitions\":";
  writeTransitionsArray(out, inference.observed_transitions);
  out << "}";
}

void emitTimingTraceError(
  const std::string& message,
  const std::string& fsm_model,
  const std::string& ff_type,
  int configured_state_count,
  int input_count,
  int output_count,
  const std::vector<std::string>& x_values,
  const std::vector<std::string>& z_values,
  const TimingInference& inference
) {
  std::cout << "{";
  std::cout << "\"status\":\"ERROR\",\"message\":";
  writeJsonString(std::cout, message);
  std::cout << ",\"metadata\":{";
  std::cout << "\"engine\":\"phase4b_timing_trace_report_solver\",";
  std::cout << "\"input_mode\":\"TIMING_TRACE\",";
  std::cout << "\"fsm_model\":";
  writeJsonString(std::cout, fsm_model);
  std::cout << ",\"ff_type\":";
  writeJsonString(std::cout, ff_type);
  std::cout << ",\"configured_state_count\":" << configured_state_count;
  std::cout << ",\"input_count\":" << input_count;
  std::cout << ",\"output_count\":" << output_count;
  std::cout << ",\"inference\":{";
  std::cout << "\"strategy\":\"phase4a_observed_trace_baseline\",";
  std::cout << "\"trace_length\":" << x_values.size();
  std::cout << ",\"configured_state_count\":" << configured_state_count;
  std::cout << ",\"inferred_state_count\":" << std::max(inference.inferred_state_count, configured_state_count);
  std::cout << ",\"deterministic\":false";
  std::cout << ",\"fsm_model\":";
  writeJsonString(std::cout, fsm_model);
  std::cout << ",\"ff_type\":";
  writeJsonString(std::cout, ff_type);
  std::cout << ",\"state_path\":";
  writeStringArray(std::cout, inference.state_path);
  std::cout << ",\"input_signal\":\"X\",\"output_signal\":\"Z\",\"warnings\":[]";
  std::cout << "}},\"debug\":{";
  std::cout << "\"timing_trace\":{\"X\":";
  writeStringArray(std::cout, x_values);
  std::cout << ",\"Z\":";
  writeStringArray(std::cout, z_values);
  std::cout << "},\"inference_report\":";
  writeInferenceReport(std::cout, inference);
  std::cout << "}}";
}

void writeEquations(std::ostream& out, const std::vector<EquationResult>& equations) {
  out << "[";
  for (std::size_t i = 0; i < equations.size(); i += 1) {
    const EquationResult& equation = equations[i];
    if (i) out << ",";
    out << "{";
    out << "\"name\":";
    writeJsonString(out, equation.name);
    out << ",\"target\":";
    writeJsonString(out, equation.target);
    out << ",\"kind\":";
    writeJsonString(out, equation.kind);
    if (!equation.ff_type.empty()) {
      out << ",\"ff_type\":";
      writeJsonString(out, equation.ff_type);
    }
    if (!equation.state_bit.empty()) {
      out << ",\"state_bit\":";
      writeJsonString(out, equation.state_bit);
    }
    if (!equation.pin.empty()) {
      out << ",\"pin\":";
      writeJsonString(out, equation.pin);
    }
    out << ",\"expression\":";
    writeJsonString(out, equation.expression);
    out << ",\"variables\":";
    writeStringArray(out, equation.variables);
    out << ",\"truth_table\":";
    writeTruthTable(out, equation);
    out << "}";
  }
  out << "]";
}

std::string valueForBits(const std::vector<TruthRow>& rows, const std::string& bits) {
  for (const TruthRow& row : rows) {
    if (row.bits == bits) return row.value;
  }
  return "X";
}

void writeKMaps(std::ostream& out, const std::vector<EquationResult>& equations) {
  out << "[";
  for (std::size_t map_index = 0; map_index < equations.size(); map_index += 1) {
    const EquationResult& equation = equations[map_index];
    if (map_index) out << ",";
    const int variable_count = static_cast<int>(equation.variables.size());
    const KMapLayout layout = layoutForVariableCount(variable_count);

    out << "{";
    out << "\"id\":";
    writeJsonString(out, "kmap_" + equation.target);
    out << ",\"name\":";
    writeJsonString(out, equation.name);
    out << ",\"target\":";
    writeJsonString(out, equation.target);
    out << ",\"variables\":";
    writeStringArray(out, equation.variables);
    out << ",\"rows\":";
    writeStringArray(out, layout.rows);
    out << ",\"cols\":";
    writeStringArray(out, layout.cols);
    out << ",\"cells\":[";
    bool first_cell = true;
    for (const std::string& row : layout.rows) {
      for (const std::string& col : layout.cols) {
        const std::string minterm = mintermForPosition(row, col, variable_count);
        if (!first_cell) out << ",";
        first_cell = false;
        out << "{";
        out << "\"id\":";
        writeJsonString(out, minterm);
        out << ",\"row\":";
        writeJsonString(out, row);
        out << ",\"col\":";
        writeJsonString(out, col);
        out << ",\"minterm\":";
        writeJsonString(out, minterm);
        out << ",\"value\":";
        writeJsonString(out, valueForBits(equation.truth_rows, minterm));
        out << "}";
      }
    }
    out << "],\"groups\":[";
    bool first_group = true;
    for (std::size_t group_index = 0; group_index < equation.groups.size(); group_index += 1) {
      const Implicant& group = equation.groups[group_index];
      std::vector<std::string> cells;
      for (const std::string& cell : group.cells) {
        cells.push_back(cell);
      }
      std::sort(cells.begin(), cells.end());
      if (cells.empty()) continue;
      if (!first_group) out << ",";
      first_group = false;
      out << "{";
      out << "\"id\":";
      writeJsonString(out, "g_" + equation.target + "_" + std::to_string(group_index));
      out << ",\"cells\":";
      writeStringArray(out, cells);
      out << ",\"term\":";
      writeJsonString(out, termFromPattern(equation.variables, group.pattern));
      out << ",\"size\":" << cells.size();
      out << "}";
    }
    out << "],\"expression\":";
    writeJsonString(out, equation.expression);
    out << "}";
  }
  out << "]";
}

std::string sourcePinForLiteral(const std::string& literal, std::vector<Node>& nodes, std::vector<Edge>& edges) {
  if (literal == "X") return "in_X.OUT";
  if (literal == "X#") {
    const std::string node_id = "not_X";
    const bool exists = std::any_of(nodes.begin(), nodes.end(), [&](const Node& node) { return node.id == node_id; });
    if (!exists) {
      nodes.push_back({node_id, "NOT", "NOT", 190, 70, {"IN", "OUT"}});
      edges.push_back({"in_X.OUT", node_id + ".IN", "X"});
    }
    return node_id + ".OUT";
  }
  if (literal.rfind("Q_", 0) == 0) {
    const bool inverted = literal.back() == '#';
    const std::string bit = inverted ? literal.substr(0, literal.size() - 1) : literal;
    const std::string suffix = bit.substr(2);
    return "ff_" + suffix + (inverted ? ".Q#" : ".Q");
  }
  return "const_0.OUT";
}

void connectExpressionToTarget(
  const EquationResult& equation,
  const std::string& target_pin,
  std::vector<Node>& nodes,
  std::vector<Edge>& edges
) {
  if (equation.expression == "0" || equation.expression == "1") {
    const std::string node_id = "const_" + equation.target + "_" + equation.expression;
    nodes.push_back({node_id, "CONSTANT", equation.expression, 210, 260, {"OUT"}});
    edges.push_back({node_id + ".OUT", target_pin, equation.expression});
    return;
  }

  const std::vector<std::string> terms = splitTerms(equation.expression);
  std::vector<std::string> term_outputs;
  for (std::size_t term_index = 0; term_index < terms.size(); term_index += 1) {
    const std::vector<std::string> literals = parseLiterals(terms[term_index], equation.variables);
    if (literals.empty()) continue;
    if (literals.size() == 1) {
      term_outputs.push_back(sourcePinForLiteral(literals[0], nodes, edges));
      continue;
    }

    const std::string node_id = "and_" + equation.target + "_" + std::to_string(term_index);
    nodes.push_back({node_id, "AND", "AND", 340, 120 + static_cast<int>(term_index) * 70, {"IN0", "IN1", "OUT"}});
    for (std::size_t literal_index = 0; literal_index < literals.size(); literal_index += 1) {
      edges.push_back({
        sourcePinForLiteral(literals[literal_index], nodes, edges),
        node_id + ".IN" + std::to_string(literal_index),
        literals[literal_index],
      });
    }
    term_outputs.push_back(node_id + ".OUT");
  }

  if (term_outputs.empty()) return;
  if (term_outputs.size() == 1) {
    edges.push_back({term_outputs[0], target_pin, equation.expression});
    return;
  }

  const std::string or_id = "or_" + equation.target;
  nodes.push_back({or_id, "OR", "OR", 500, 160, {"IN0", "IN1", "OUT"}});
  for (std::size_t i = 0; i < term_outputs.size(); i += 1) {
    edges.push_back({term_outputs[i], or_id + ".IN" + std::to_string(i), "term_" + std::to_string(i)});
  }
  edges.push_back({or_id + ".OUT", target_pin, equation.target});
}

void writeCircuitLayout(
  std::ostream& out,
  const std::vector<std::string>& bit_names,
  const std::vector<std::string>& outputs,
  const std::vector<EquationResult>& equations,
  const std::string& ff_type
) {
  std::vector<Node> nodes;
  std::vector<Edge> edges;
  const std::string ff_node_type = ff_type + "_FF";
  const std::vector<std::string> ff_pins = ff_type == "JK"
    ? std::vector<std::string>{"J", "K", "Q", "Q#", "CLK", "CLR", "RST"}
    : (ff_type == "SR"
      ? std::vector<std::string>{"S", "R", "Q", "Q#", "CLK", "CLR", "RST"}
      : std::vector<std::string>{ff_type == "T" ? "T" : "D", "Q", "Q#", "CLK", "CLR", "RST"});
  nodes.push_back({"in_X", "INPUT_PIN", "X", 40, 100, {"OUT"}});
  for (std::size_t i = 0; i < bit_names.size(); i += 1) {
    const std::string suffix = bit_names[i].substr(2);
    nodes.push_back({
      "ff_" + suffix,
      ff_node_type,
      ff_type + " FF " + suffix,
      260,
      190 + static_cast<int>(i) * 105,
      ff_pins,
    });
  }
  for (std::size_t i = 0; i < outputs.size(); i += 1) {
    nodes.push_back({"out_" + outputs[i], "OUTPUT_PIN", outputs[i], 700, 120 + static_cast<int>(i) * 80, {"IN"}});
  }

  for (const EquationResult& equation : equations) {
    if (equation.kind == "ff_input") {
      const std::string suffix = equation.target.substr(2);
      const std::string pin = equation.pin.empty() ? (ff_type == "T" ? "T" : "D") : equation.pin;
      connectExpressionToTarget(equation, "ff_" + suffix + "." + pin, nodes, edges);
    } else {
      connectExpressionToTarget(equation, "out_" + equation.target + ".IN", nodes, edges);
    }
  }

  out << "{\"nodes\":[";
  for (std::size_t i = 0; i < nodes.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    out << "\"id\":";
    writeJsonString(out, nodes[i].id);
    out << ",\"type\":";
    writeJsonString(out, nodes[i].type);
    out << ",\"label\":";
    writeJsonString(out, nodes[i].label);
    out << ",\"x\":" << nodes[i].x;
    out << ",\"y\":" << nodes[i].y;
    out << ",\"pins\":";
    writeStringArray(out, nodes[i].pins);
    out << "}";
  }
  out << "],\"edges\":[";
  for (std::size_t i = 0; i < edges.size(); i += 1) {
    if (i) out << ",";
    out << "{";
    out << "\"from\":";
    writeJsonString(out, edges[i].from);
    out << ",\"to\":";
    writeJsonString(out, edges[i].to);
    out << ",\"label\":";
    writeJsonString(out, edges[i].label);
    out << ",\"signal\":";
    writeJsonString(out, edges[i].label);
    out << "}";
  }
  out << "]}";
}

int main() {
  const std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
  if (input.empty()) {
    emitError("Empty stdin");
    return 0;
  }

  const std::string input_mode = extractJsonString(input, "input_mode", "UNKNOWN");
  const std::string fsm_model = extractJsonString(input, "fsm_model", "UNKNOWN");
  const std::string ff_type = extractJsonString(input, "ff_type", "UNKNOWN");
  const int configured_state_count = extractJsonInt(input, "state_count", 0);
  int state_count = configured_state_count;
  const int input_count = extractJsonInt(input, "input_count", 0);
  const int output_count = extractJsonInt(input, "output_count", 0);

  if (configured_state_count > 8) {
    emitError("Phase 4A supports up to 8 states");
    return 0;
  }

  const bool supported_common =
    (ff_type == "D" || ff_type == "T" || ff_type == "JK" || ff_type == "SR") &&
    input_count == 1 &&
    output_count == 1 &&
    (fsm_model == "Mealy" || fsm_model == "Moore") &&
    configured_state_count >= 1;
  if (!supported_common || (input_mode != "STATE_TABLE" && input_mode != "TIMING_TRACE")) {
    emitError(input_mode == "TIMING_TRACE" ? "Unsupported Timing Trace scope in Phase 4A" : "Unsupported solver scope in Phase 4A");
    return 0;
  }

  std::vector<std::string> states = extractStringArray(input, "states");
  if (states.empty()) {
    for (int i = 0; i < configured_state_count; i += 1) states.push_back(stateNameForIndex(i));
  }
  std::vector<std::string> inputs = extractStringArray(input, "inputs");
  if (inputs.empty()) inputs = {"X"};
  std::vector<std::string> outputs = extractStringArray(input, "outputs");
  if (outputs.empty()) outputs = input_mode == "TIMING_TRACE" ? std::vector<std::string>{"Z"} : std::vector<std::string>{"Y"};
  std::vector<Transition> transitions = parseTransitions(input);
  std::vector<std::string> trace_x_values;
  std::vector<std::string> trace_z_values;
  std::vector<Transition> inferred_observed_transitions;
  std::vector<std::string> inferred_state_path;
  TimingInference timing_inference;

  if (input_mode == "TIMING_TRACE") {
    trace_x_values = extractTimingTraceValues(input, "X");
    trace_z_values = extractTimingTraceValues(input, "Z");
    if (extractObjectSlice(input, "timing_trace").empty()) {
      timing_inference.message = "TIMING_TRACE input requires timing_trace";
      emitTimingTraceError(timing_inference.message, fsm_model, ff_type, configured_state_count, input_count, output_count, trace_x_values, trace_z_values, timing_inference);
      return 0;
    }

    timing_inference = inferTimingTrace(trace_x_values, trace_z_values, fsm_model, configured_state_count);
    if (!timing_inference.ok) {
      emitTimingTraceError(timing_inference.message, fsm_model, ff_type, configured_state_count, input_count, output_count, trace_x_values, trace_z_values, timing_inference);
      return 0;
    }

    state_count = timing_inference.inferred_state_count;
    states = timing_inference.states;
    transitions = timing_inference.transitions;
    inferred_observed_transitions = timing_inference.observed_transitions;
    inferred_state_path = timing_inference.state_path;
  }

  if (static_cast<int>(states.size()) != state_count) {
    emitError("states count mismatch");
    return 0;
  }
  if (transitions.empty()) {
    emitError("missing transition");
    return 0;
  }

  std::map<std::string, int> state_to_index;
  for (int i = 0; i < state_count; i += 1) {
    state_to_index[states[i]] = i;
  }

  std::map<std::string, Transition> transition_by_key;
  std::map<std::string, std::string> moore_output_by_state;
  for (const Transition& transition : transitions) {
    if (transition.present.empty() || transition.input.empty() || transition.next.empty() || transition.output.empty()) {
      emitError("transition missing field");
      return 0;
    }
    if (!state_to_index.count(transition.present) || !state_to_index.count(transition.next)) {
      emitError("unknown state in transition");
      return 0;
    }
    if ((transition.input != "0" && transition.input != "1") || (transition.output != "0" && transition.output != "1")) {
      emitError("transition input/output must be binary");
      return 0;
    }
    const std::string key = transition.present + "|" + transition.input;
    if (transition_by_key.count(key)) {
      emitError("duplicate transition");
      return 0;
    }
    transition_by_key[key] = transition;

    if (fsm_model == "Moore") {
      if (moore_output_by_state.count(transition.present) &&
          moore_output_by_state[transition.present] != transition.output) {
        emitError("Moore output inconsistency");
        return 0;
      }
      moore_output_by_state[transition.present] = transition.output;
    }
  }

  for (const std::string& state : states) {
    for (const std::string& x : {"0", "1"}) {
      if (!transition_by_key.count(state + "|" + x)) {
        emitError("missing transition for " + state + " input " + x);
        return 0;
      }
    }
  }

  const int bit_count = stateBitCount(state_count);
  const int encoded_capacity = 1 << bit_count;
  std::vector<std::string> bit_names;
  for (int i = 0; i < bit_count; i += 1) bit_names.push_back(bitName(i));

  std::map<std::string, std::string> encoding_by_state;
  for (int i = 0; i < state_count; i += 1) {
    encoding_by_state[states[i]] = binaryForIndex(i, bit_count);
  }
  std::vector<std::string> unused_encodings;
  std::vector<std::string> dont_care_minterms;
  for (int i = state_count; i < encoded_capacity; i += 1) {
    const std::string encoding = binaryForIndex(i, bit_count);
    unused_encodings.push_back(encoding);
    dont_care_minterms.push_back("0" + encoding);
    dont_care_minterms.push_back("1" + encoding);
  }

  std::vector<std::string> logic_variables = {"X"};
  logic_variables.insert(logic_variables.end(), bit_names.begin(), bit_names.end());

  std::vector<EquationResult> equations;
  std::vector<std::string> warnings;
  for (int bit = 0; bit < bit_count; bit += 1) {
    const std::vector<std::string> pins = (ff_type == "JK" || ff_type == "SR")
      ? (ff_type == "JK" ? std::vector<std::string>{"J", "K"} : std::vector<std::string>{"S", "R"})
      : std::vector<std::string>{ff_type};
    auto buildEquation = [&](const std::string& pin, bool conservative_sr) {
      EquationResult equation;
      equation.name = pin + "_" + aliasForIndex(bit);
      equation.target = equation.name;
      equation.kind = "ff_input";
      equation.ff_type = ff_type;
      equation.state_bit = bit_names[bit];
      equation.pin = pin;
      equation.variables = logic_variables;
      for (int present_index = 0; present_index < encoded_capacity; present_index += 1) {
        const std::string present_bits = binaryForIndex(present_index, bit_count);
        for (const std::string& x : {"0", "1"}) {
          TruthRow row;
          row.bits = x + present_bits;
          if (present_index >= state_count) {
            row.value = "X";
          } else {
            const Transition& transition = transition_by_key[states[present_index] + "|" + x];
            const char present_bit = present_bits[bit];
            const char next_bit = encoding_by_state[transition.next][bit];
            if (ff_type == "T") {
              row.value = std::string(present_bit == next_bit ? "0" : "1");
            } else if (ff_type == "JK") {
              if (pin == "J") {
                row.value = present_bit == '0' ? std::string(1, next_bit) : "X";
              } else {
                row.value = present_bit == '1' ? std::string(next_bit == '0' ? "1" : "0") : "X";
              }
            } else if (ff_type == "SR") {
              row.value = srExcitationValue(pin, present_bit, next_bit, conservative_sr);
            } else {
              row.value = std::string(1, next_bit);
            }
          }
          equation.truth_rows.push_back(row);
        }
      }
      equation.groups = minimizeRows(equation.truth_rows);
      equation.expression = expressionFromGroups(equation.variables, equation.groups);
      return equation;
    };

    std::vector<EquationResult> bit_equations;
    for (const std::string& pin : pins) {
      bit_equations.push_back(buildEquation(pin, false));
    }

    if (ff_type == "SR" && bit_equations.size() == 2) {
      const bool illegal_overlap = hasSrIllegalOverlap(bit_equations[0], bit_equations[1], state_count);
      const bool constant_assertion = bit_equations[0].expression == "1" || bit_equations[1].expression == "1";
      if (illegal_overlap || constant_assertion) {
        bit_equations.clear();
        bit_equations.push_back(buildEquation("S", true));
        bit_equations.push_back(buildEquation("R", true));
        warnings.push_back(
          illegal_overlap
            ? "SR minimization fallback: illegal S/R overlap avoided"
            : "SR minimization fallback: conservative S/R assertion selected"
        );
      }
    }

    for (const EquationResult& equation : bit_equations) {
      equations.push_back(equation);
    }
  }

  EquationResult output_equation;
  output_equation.name = outputs[0];
  output_equation.target = outputs[0];
  output_equation.kind = "output";
  output_equation.variables = fsm_model == "Moore" ? bit_names : logic_variables;
  if (fsm_model == "Moore") {
    for (int present_index = 0; present_index < encoded_capacity; present_index += 1) {
      TruthRow row;
      row.bits = binaryForIndex(present_index, bit_count);
      row.value = present_index >= state_count ? "X" : moore_output_by_state[states[present_index]];
      output_equation.truth_rows.push_back(row);
    }
  } else {
    for (int present_index = 0; present_index < encoded_capacity; present_index += 1) {
      const std::string present_bits = binaryForIndex(present_index, bit_count);
      for (const std::string& x : {"0", "1"}) {
        TruthRow row;
        row.bits = x + present_bits;
        row.value = present_index >= state_count ? "X" : transition_by_key[states[present_index] + "|" + x].output;
        output_equation.truth_rows.push_back(row);
      }
    }
  }
  output_equation.groups = minimizeRows(output_equation.truth_rows);
  output_equation.expression = expressionFromGroups(output_equation.variables, output_equation.groups);
  equations.push_back(output_equation);

  std::map<std::string, std::vector<int>> trace_steps_by_transition;
  auto transitionTraceKey = [](const Transition& transition) {
    return transition.present + "|" + transition.input + "|" + transition.next + "|" + transition.output;
  };
  if (input_mode == "TIMING_TRACE") {
    for (std::size_t i = 0; i < inferred_observed_transitions.size(); i += 1) {
      trace_steps_by_transition[transitionTraceKey(inferred_observed_transitions[i])].push_back(static_cast<int>(i));
    }
  }

  std::cout << "{";
  std::cout << "\"status\":\"OK\",";
  std::cout << "\"metadata\":{";
  std::cout << "\"engine\":\"phase4b_timing_trace_report_solver\",";
  std::cout << "\"input_mode\":";
  writeJsonString(std::cout, input_mode);
  std::cout << ",\"fsm_model\":";
  writeJsonString(std::cout, fsm_model);
  std::cout << ",\"ff_type\":";
  writeJsonString(std::cout, ff_type);
  std::cout << ",\"state_count\":" << state_count;
  std::cout << ",\"configured_state_count\":" << configured_state_count;
  std::cout << ",\"input_count\":" << input_count;
  std::cout << ",\"output_count\":" << output_count;
  std::cout << ",\"state_bits\":" << bit_count;
  std::cout << ",\"state_bit_names\":";
  writeStringArray(std::cout, bit_names);
  std::cout << ",\"state_encoding\":{";
  for (int i = 0; i < state_count; i += 1) {
    if (i) std::cout << ",";
    writeJsonString(std::cout, states[i]);
    std::cout << ":";
    writeJsonString(std::cout, encoding_by_state[states[i]]);
  }
  std::cout << "},\"inputs\":";
  writeStringArray(std::cout, inputs);
  std::cout << ",\"outputs\":";
  writeStringArray(std::cout, outputs);
  std::cout << ",\"warnings\":";
  writeStringArray(std::cout, warnings);
  if (input_mode == "TIMING_TRACE") {
    std::cout << ",\"inference\":{";
    std::cout << "\"strategy\":\"phase4a_observed_trace_baseline\",";
    std::cout << "\"trace_length\":" << trace_x_values.size();
    std::cout << ",\"inferred_state_count\":" << state_count;
    std::cout << ",\"configured_state_count\":" << configured_state_count;
    std::cout << ",\"deterministic\":true";
    std::cout << ",\"fsm_model\":";
    writeJsonString(std::cout, fsm_model);
    std::cout << ",\"ff_type\":";
    writeJsonString(std::cout, ff_type);
    std::cout << ",\"state_path\":";
    writeStringArray(std::cout, timing_inference.state_path);
    std::cout << ",\"input_signal\":\"X\",\"output_signal\":";
    writeJsonString(std::cout, outputs[0]);
    std::cout << ",\"warnings\":[]";
    std::cout << "}";
  }
  std::cout << "},";

  std::cout << "\"equations\":";
  writeEquations(std::cout, equations);
  std::cout << ",\"k_maps\":";
  writeKMaps(std::cout, equations);

  std::cout << ",\"state_graph\":{\"states\":[";
  for (int i = 0; i < state_count; i += 1) {
    if (i) std::cout << ",";
    std::cout << "{";
    std::cout << "\"id\":";
    writeJsonString(std::cout, states[i]);
    std::cout << ",\"label\":";
    writeJsonString(std::cout, states[i]);
    std::cout << ",\"encoding\":";
    writeJsonString(std::cout, encoding_by_state[states[i]]);
    if (fsm_model == "Moore") {
      std::cout << ",\"output\":";
      writeJsonString(std::cout, moore_output_by_state[states[i]]);
    }
    std::cout << "}";
  }
  std::cout << "],\"transitions\":[";
  for (std::size_t i = 0; i < transitions.size(); i += 1) {
    if (i) std::cout << ",";
    std::cout << "{";
    std::cout << "\"from\":";
    writeJsonString(std::cout, transitions[i].present);
    std::cout << ",\"to\":";
    writeJsonString(std::cout, transitions[i].next);
    std::cout << ",\"input\":";
    writeJsonString(std::cout, transitions[i].input);
    std::cout << ",\"output\":";
    writeJsonString(std::cout, transitions[i].output);
    std::cout << ",\"label\":";
    writeJsonString(std::cout, fsm_model == "Moore" ? transitions[i].input : transitions[i].input + "/" + transitions[i].output);
    if (input_mode == "TIMING_TRACE") {
      const auto found_steps = trace_steps_by_transition.find(transitionTraceKey(transitions[i]));
      if (found_steps != trace_steps_by_transition.end()) {
        std::cout << ",\"trace_steps\":";
        writeIntArray(std::cout, found_steps->second);
      }
    }
    std::cout << "}";
  }
  std::cout << "]},";

  const std::vector<std::string> simulation_inputs = input_mode == "TIMING_TRACE"
    ? trace_x_values
    : std::vector<std::string>{"0", "1", "1", "0"};
  std::vector<std::string> current_states;
  std::vector<std::string> y_values;
  if (input_mode == "TIMING_TRACE") {
    current_states = inferred_state_path;
    y_values = trace_z_values;
  } else {
    std::string current_state = states[0];
    for (const std::string& x : simulation_inputs) {
      current_states.push_back(current_state);
      const Transition& transition = transition_by_key[current_state + "|" + x];
      y_values.push_back(transition.output);
      current_state = transition.next;
    }
  }
  std::vector<std::string> clock_values;
  std::vector<int> step_indexes;
  for (std::size_t i = 0; i < simulation_inputs.size(); i += 1) {
    step_indexes.push_back(static_cast<int>(i));
  }
  for (std::size_t i = 0; i < simulation_inputs.size() * 2; i += 1) {
    clock_values.push_back((i % 2) == 0 ? "0" : "1");
  }

  std::cout << "\"timing_diagram\":{\"source\":";
  writeJsonString(std::cout, input_mode == "TIMING_TRACE" ? "timing_trace_input" : "state_table_simulation");
  std::cout << ",\"trace_length\":" << simulation_inputs.size();
  std::cout << ",\"step_indexes\":";
  writeIntArray(std::cout, step_indexes);
  std::cout << ",\"signals\":[";
  std::cout << "{\"name\":\"CLK\",\"values\":";
  writeStringArray(std::cout, clock_values);
  std::cout << "},";
  std::cout << "{\"name\":\"X\",\"values\":";
  writeStringArray(std::cout, simulation_inputs);
  std::cout << "}";
  for (int bit = 0; bit < bit_count; bit += 1) {
    std::vector<std::string> values;
    for (const std::string& state : current_states) {
      values.push_back(std::string(1, encoding_by_state[state][bit]));
    }
    std::cout << ",{\"name\":";
    writeJsonString(std::cout, bit_names[bit]);
    std::cout << ",\"values\":";
    writeStringArray(std::cout, values);
    std::cout << "}";
  }
  std::cout << ",{\"name\":";
  writeJsonString(std::cout, outputs[0]);
  std::cout << ",\"values\":";
  writeStringArray(std::cout, y_values);
  std::cout << "}]}";

  std::cout << ",\"circuit_layout\":";
  writeCircuitLayout(std::cout, bit_names, outputs, equations, ff_type);

  std::cout << ",\"debug\":{";
  std::cout << "\"engine\":\"phase4b_timing_trace_report_solver\",";
  std::cout << "\"received_input\":{";
  std::cout << "\"input_mode\":";
  writeJsonString(std::cout, input_mode);
  std::cout << ",\"fsm_model\":";
  writeJsonString(std::cout, fsm_model);
  std::cout << ",\"ff_type\":";
  writeJsonString(std::cout, ff_type);
  std::cout << ",\"state_count\":" << state_count;
  std::cout << ",\"configured_state_count\":" << configured_state_count;
  std::cout << ",\"input_count\":" << input_count;
  std::cout << ",\"output_count\":" << output_count;
  std::cout << "},\"unused_encodings\":";
  writeStringArray(std::cout, unused_encodings);
  std::cout << ",\"dont_care_minterms\":";
  writeStringArray(std::cout, dont_care_minterms);
  std::cout << ",\"warnings\":";
  writeStringArray(std::cout, warnings);
  if (input_mode == "TIMING_TRACE") {
    std::cout << ",\"timing_trace\":{\"X\":";
    writeStringArray(std::cout, trace_x_values);
    std::cout << ",\"Z\":";
    writeStringArray(std::cout, trace_z_values);
    std::cout << "},\"inferred_transitions\":";
    writeTransitionsArray(std::cout, inferred_observed_transitions);
    std::cout << ",\"inference_report\":";
    writeInferenceReport(std::cout, timing_inference);
  }
  std::cout << ",\"note\":\"Boolean minimization, K-Map grouping, D/T/JK/SR excitation, and Timing Trace inference report for Phase 4B\"";
  std::cout << "}";

  std::cout << "}";
  return 0;
}
