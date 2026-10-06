"""Creates local database credentials without overwriting an existing setup."""
from pathlib import Path
import secrets
root=Path(__file__).resolve().parent
root_env=root/'.env'; backend_env=root/'backend'/'.env'
if root_env.exists() or backend_env.exists():
    print('An environment file already exists. Nothing overwritten. See SETUP.md to resume.')
else:
    password=secrets.token_hex(24)
    root_env.write_text('POSTGRES_PASSWORD='+password+'\n',encoding='utf-8')
    backend_env.write_text('DATABASE_URL=postgresql+psycopg://nirala:'+password+'@127.0.0.1:5544/nirala\nALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000\nCOOKIE_SECURE=false\n',encoding='utf-8')
    print('Local settings created. Next: docker compose up -d')
