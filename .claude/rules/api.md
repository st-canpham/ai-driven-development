---
paths: ["apps/api/**"]
---
# API rules
- One Nest module per domain folder: `src/<domain>/{<domain>.module,controller,service,entity}.ts`, DTOs in `dto/`.
- Validate every request body with class-validator DTOs; never trust raw `body`.
- Controllers stay thin: no TypeORM calls in controllers, only in services.
- Throw Nest HTTP exceptions (`ConflictException`, `NotFoundException`…), never return error objects with 200.
- Dates are stored and returned in UTC ISO-8601.
