---
name: go-spec-first-regenerate
description: A spec-first Go service generates internal/api/api.gen.go from api/openapi.yaml with oapi-codegen through go:generate. The old guidance only knew specs generated from code, so it treated the spec as hand-written and invited a matching hand edit to the generated Order struct. The answer edits the spec, regenerates with go generate, and leaves api.gen.go to the generator.
tags: [api, openapi, go, codegen]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

orders need an optional free-text `note` field in the GET /orders/{id} response. what are the exact changes? show me the diffs, don't run anything
