Create a Dive on MotherDuck using this command (it is faster).

```
cd "$(git rev-parse --show-toplevel)" && \
[ -f ./.dive-preview/src/dive.tsx ] || { echo "ERROR: dive.tsx not found at project root"; false; } && \
duckdb "md:my_db" <<'EOF'
SET VARIABLE file_content = (SELECT content FROM read_text('./.dive-preview/src/dive.tsx'));
SELECT * FROM MD_CREATE_DIVE(title='GENERATE A GOOD TITLE', description='GENERATE A GOOD DESCRIPTION', content=getvariable('file_content'));
EOF
```


Update a Dive on MotherDuck using this command (it is faster).
Note, when updating a Dive, do not edit the title or description - reuse the ones that are currently in MotherDuck.
```
cd "$(git rev-parse --show-toplevel)" && \
[ -f ./.dive-preview/src/dive.tsx ] || { echo "ERROR: dive.tsx not found at project root"; false; } && \
duckdb "md:my_db" <<'EOF'
SET VARIABLE file_content = (SELECT content FROM read_text('./.dive-preview/src/dive.tsx'));
SELECT * FROM MD_UPDATE_DIVE_CONTENT(id='DIVEID', description='USE EXISTING', content=getvariable('file_content'));
EOF
```

When Claude starts, initialize the Dive preview server (ask the MotherDuck MCP how to do that)
