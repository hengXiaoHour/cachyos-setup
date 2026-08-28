---
name: verify-before-handover
description: Use ALWAYS after every modification. Test changes to prove they work before handing to user. Applies to plugins, MCP servers, config edits, scripts, any code change.
---

# Verify Before Handover

After making ANY modification, follow this workflow:

## 1. Test Immediately
Run verification commands to prove the change works:
- Plugin changes: call the tool directly
- Config changes: validate syntax and run `opencode debug info`
- Script changes: execute the script
- File changes: verify file exists and has correct content

## 2. Document Results
Show the test output proving success:
```
✅ [tool/feature name] - working
```

## 3. Hand Over
Only after tests pass, present to user:
- What was changed
- Test results proving it works
- Instructions for user to verify themselves

## Rules
- NEVER hand over untested changes
- NEVER say "it should work" - prove it works
- If test fails, fix and re-test before handing over
- One exception: user explicitly says "skip testing"

## Example
```
Modified: ~/.config/opencode/plugins/my-plugin/index.js

Test:
$ curl -s http://localhost:3001
{"tools":["my_tool"]}

✅ Plugin loaded, tool registered

Your turn to test: call my_tool with args {...}
```
