namespace CUSTOM_PS2xOnline.Core.Services;

public sealed record ValidationResult(bool IsSuccess, string ErrorCode = "", string ErrorMessage = "")
{
    public static ValidationResult Success() => new(true);

    public static ValidationResult Failure(string errorCode, string errorMessage) => new(false, errorCode, errorMessage);
}
