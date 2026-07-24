namespace CUSTOM_PS2xOnline.Core.Models;

public sealed record GameEntry(string Title, string FilePath, string Format)
{
    public string FileName => Path.GetFileName(FilePath);
}
