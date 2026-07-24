using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.Core.Interfaces;

public interface IGameLibraryService
{
    IReadOnlyList<GameEntry> Scan(string folderPath);
}
