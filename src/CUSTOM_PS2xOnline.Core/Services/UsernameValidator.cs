namespace CUSTOM_PS2xOnline.Core.Services;

public static class UsernameValidator
{
    public static ValidationResult Validate(string username)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return ValidationResult.Failure("VAL-USER-001", "Username is required.");
        }

        if (username.Length < 3 || username.Length > 24)
        {
            return ValidationResult.Failure("VAL-USER-001", "Username must be between 3 and 24 characters.");
        }

        if (username.Any(char.IsWhiteSpace))
        {
            return ValidationResult.Failure("VAL-USER-001", "Username cannot contain whitespace.");
        }

        return ValidationResult.Success();
    }
}
