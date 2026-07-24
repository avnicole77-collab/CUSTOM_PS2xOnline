using BCrypt.Net;

namespace CUSTOM_PS2xOnline.Infrastructure.Services;

public sealed class PinHashService
{
    public string HashPin(string pin)
    {
        return BCrypt.Net.BCrypt.HashPassword(pin, 8);
    }

    public bool VerifyPin(string pin, string hash)
    {
        return BCrypt.Net.BCrypt.Verify(pin, hash);
    }
}
