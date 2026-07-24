using CUSTOM_PS2xOnline.Core.Models;

namespace CUSTOM_PS2xOnline.Core.Interfaces;

public interface IAppSettingsService
{
    AppSettingsModel Load();
    void Save(AppSettingsModel settings);
}
