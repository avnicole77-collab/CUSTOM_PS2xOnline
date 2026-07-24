# PCSX2 Integration

Recommended integration uses ProcessStartInfo with escaped executable and game file paths.

Important rules:
- Validate executable path before launching
- Backup configuration before writes
- Never pass raw shell command strings directly
