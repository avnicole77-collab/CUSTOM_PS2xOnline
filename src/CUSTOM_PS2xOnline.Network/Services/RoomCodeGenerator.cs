namespace CUSTOM_PS2xOnline.Network.Services;

public static class RoomCodeGenerator
{
    private const string Alphabet = "ABCDEFGHJKLMNPRSTUVWXYZ23456789";

    public static string Generate(int length = 6)
    {
        var random = Random.Shared;
        var chars = new char[length];

        for (var i = 0; i < length; i++)
        {
            chars[i] = Alphabet[random.Next(Alphabet.Length)];
        }

        return new string(chars);
    }
}
