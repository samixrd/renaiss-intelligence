import re

with open(r"C:\Users\Acer\.gemini\antigravity\brain\85669902-dcf8-40b0-9d46-bda7503d2629\.system_generated\steps\325\content.md", "r", encoding="utf-8") as f:
    content = f.read()

print("localhost:8000 found:", "localhost:8000" in content)
print("vercel.app found:", "vercel.app" in content)

# Look for fetch calls
for m in re.finditer(r"fetch\s*\(", content):
    start = max(0, m.start() - 100)
    end = min(len(content), m.end() + 200)
    print(f"--- Fetch call at {m.start()} ---")
    print(content[start:end])
