using System.Windows;

using CUSTOM_PS2xOnline.App.ViewModels;
using Microsoft.Win32;

namespace CUSTOM_PS2xOnline.App;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private MainViewModel? ViewModel => DataContext as MainViewModel;

    private void BrowsePcsx2_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Select PCSX2 executable",
            Filter = "PCSX2 executable (pcsx2*.exe)|pcsx2*.exe|Executable files (*.exe)|*.exe"
        };

        if (dialog.ShowDialog(this) == true && ViewModel is not null)
        {
            ViewModel.Pcsx2ExecutablePath = dialog.FileName;
        }
    }

    private void BrowseBios_Click(object sender, RoutedEventArgs e) => BrowseFolder(
        "Select BIOS folder",
        path =>
        {
            if (ViewModel is not null)
            {
                ViewModel.BiosFolder = path;
            }
        });

    private void BrowseGames_Click(object sender, RoutedEventArgs e) => BrowseFolder(
        "Select game folder",
        path =>
        {
            if (ViewModel is not null)
            {
                ViewModel.GameFolder = path;
            }
        });

    private void BrowseFolder(string title, Action<string> assign)
    {
        var dialog = new OpenFolderDialog { Title = title };
        if (dialog.ShowDialog(this) == true)
        {
            assign(dialog.FolderName);
        }
    }
}
