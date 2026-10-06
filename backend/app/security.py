import hashlib, secrets, hmac

def hash_password(password):
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return salt + ':' + key.hex()

def verify_password(password, stored):
    salt, expected = stored.split(':')
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)

def token_hash(token): return hashlib.sha256(token.encode()).hexdigest()
