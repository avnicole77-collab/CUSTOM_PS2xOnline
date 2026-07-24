using System.Windows;
using System.IO;
using CUSTOM_PS2xOnline.App.ViewModels;
using CUSTOM_PS2xOnline.Core.Interfaces;
using CUSTOM_PS2xOnline.Infrastructure.Data;
using CUSTOM_PS2xOnline.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CUSTOM_PS2xOnline.App;

public partial class App : Application
{
    private IHost? _host;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var hostBuilder = Host.CreateDefaultBuilder()
            .ConfigureServices(services =>
            {
                var databasePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "CUSTOM_PS2xOnline",
                    "data",
                    "custom-ps2xonline.db");
                Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);

                services.AddDbContext<AppDbContext>(options =>
                    options.UseSqlite($"Data Source={databasePath}"));
                services.AddSingleton<IAppSettingsService, AppSettingsService>();
                services.AddSingleton<MainViewModel>();
            });

        _host = hostBuilder.Build();
        _host.Start();

        using (var scope = _host.Services.CreateScope())
        {
            var database = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            database.Database.EnsureCreated();
        }

        var mainWindow = new MainWindow
        {
            DataContext = _host.Services.GetRequiredService<MainViewModel>()
        };

        mainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _host?.StopAsync().GetAwaiter().GetResult();
        _host?.Dispose();
        base.OnExit(e);
    }
}

