using CUSTOM_PS2xOnline.Core.Services;

namespace CUSTOM_PS2xOnline.PCSX2.Services;

public static class Pcsx2PathValidator
{
    public static ValidationResult Validate(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return ValidationResult.Failure("VAL-PCSX2-001", "PCSX2 path is required.");
        }

        if (!path.EndsWith("pcsx2-qt.exe", StringComparison.OrdinalIgnoreCase) && !path.EndsWith("pcsx2.exe", StringComparison.OrdinalIgnoreCase))
        {
            return ValidationResult.Failure("VAL-PCSX2-001", "PCSX2 executable must point to pcsx2-qt.exe or pcsx2.exe.");
        }

        return ValidationResult.Success();
    }
}
