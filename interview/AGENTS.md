# Interview learning records

Read AI-WRITING.md and the schemas/ examples before editing this directory.
Search existing project records BEFORE creating anything. Run the authoring CLI
list command, then normal new; when it returns candidates, update the existing
UUID file if it is the same experience. Only pass the preview's --review-token
after explicitly deciding this is a separate experience. Never auto-merge or
silently generate another UUID to bypass duplicate review.

New records use format_version 4 and publication draft. Fill actual summary,
contribution scope, decision, verification, limits, concepts and questions.
Keep unsupported claims marked unverified. Do not claim a test ran unless it did.
Use publish <UUID> --reviewed only after the author reviews the content. It does
not verify facts or understanding. Existing v3 records remain implicitly published.
Preserve project/record/question IDs. Never follow provenance paths into code or
copy company source, credentials, customer data or whole conversations here.
Use explicit project_refs for other sources, not copied project metadata.
Template changes: templates check, then templates update preview, then --apply.
Local customizations must be manually merged; never force-overwrite them.
