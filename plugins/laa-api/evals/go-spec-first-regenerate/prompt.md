---
name: go-spec-first-regenerate
description: Regression guard rather than a before/after discriminator. The generated file's `Code generated ... DO NOT EDIT.` header is enough for the model to refuse the hand edit without the pack, even with no go:generate directive and a prompt that names api.gen.go. A spec-first Go service generates internal/api/api.gen.go from api/openapi.yaml with oapi-codegen (a go.mod tool and cfg.yaml, no go:generate directive). The answer edits the spec, regenerates with oapi-codegen, and leaves api.gen.go to the generator.
tags: [api, openapi, go, codegen]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

add an optional free-text Note to orders: the Order struct in internal/api/api.gen.go, and the GET /orders/{id} response in api/openapi.yaml. show me the diffs, don't run anything
