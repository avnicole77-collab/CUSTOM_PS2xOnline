namespace CUSTOM_PS2xOnline.Core.Services;

public static class FilePathValidator
{
    public static ValidationResult Validate(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return ValidationResult.Failure("VAL-FILE-001", "Path is required.");
        }

        if (path.Contains("..\\") || path.Contains("../") || path.Contains(".."))
        {
            return ValidationResult.Failure("VAL-FILE-001", "Path traversal is not allowed.");
        }

        return ValidationResult.Success();
    }
}
