namespace CUSTOM_PS2xOnline.Core.Services;

public sealed class GameDuplicateDetector
{
    public bool IsDuplicate(object left, object right)
    {
        if (left is null || right is null)
        {
            return false;
        }

        var leftPath = GetPropertyValue(left, "FilePath");
        var rightPath = GetPropertyValue(right, "FilePath");

        return string.Equals(leftPath, rightPath, StringComparison.OrdinalIgnoreCase);
    }

    private static string? GetPropertyValue(object target, string propertyName)
    {
        var property = target.GetType().GetProperty(propertyName);
        return property?.GetValue(target)?.ToString();
    }
}
