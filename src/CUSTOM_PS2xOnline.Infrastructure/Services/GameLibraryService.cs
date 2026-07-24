using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.Infrastructure.Services;

public sealed class GameLibraryService : IGameLibraryService
{
    private static readonly HashSet<string> SupportedExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".iso", ".bin", ".chd", ".cso" };

    public IReadOnlyList<GameEntry> Scan(string folderPath)
    {
        if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
        {
            return [];
        }

        try
        {
            return Directory
                .EnumerateFiles(folderPath, "*.*", SearchOption.AllDirectories)
                .Where(path => SupportedExtensions.Contains(Path.GetExtension(path)))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(path => Path.GetFileNameWithoutExtension(path), StringComparer.CurrentCultureIgnoreCase)
                .Select(path => new GameEntry(
                    Path.GetFileNameWithoutExtension(path),
                    Path.GetFullPath(path),
                    Path.GetExtension(path).TrimStart('.').ToUpperInvariant()))
                .ToArray();
        }
        catch (UnauthorizedAccessException)
        {
            return [];
        }
        catch (IOException)
        {
            return [];
        }
    }
}
