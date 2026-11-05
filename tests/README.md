# Cross-service checks

`integration/` is reserved for real service-boundary checks and `e2e/` for complete user journeys. Focused unit tests belong next to the owning module. Empty directories are placeholders, not passing test evidence. Docker-backed checks must be explicitly introduced and run when infrastructure work is authorized.
