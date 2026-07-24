namespace CUSTOM_PS2xOnline.Core.Interfaces;

public interface IRemotePlayService
{
    bool IsInstalled();
    string? FindExecutable();
    void Open();
}
