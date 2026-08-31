from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_auth_signup_and_login_flow():
    # Use a unique email
    email = "test.investigator@forensics.org"
    password = "SuperSecretPassword123!"
    full_name = "Inspector Clouseau"
    org = "Interpol Cyber Division"

    # 1. Signup
    signup_resp = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": password,
            "full_name": full_name,
            "organization": org,
        },
    )
    # May be 201 created, or 409 if already exists from prior run
    if signup_resp.status_code == 409:
        # Already exists, try login
        pass
    else:
        assert signup_resp.status_code == 201
        data = signup_resp.json()
        assert "token" in data
        assert data["user"]["email"] == email
        assert data["user"]["full_name"] == full_name
        assert data["user"]["organization"] == org

    # 2. Login with correct password
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]
    assert token.startswith("son_auth_")

    # 3. Login with wrong password
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401

    # 4. Fetch me with token
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email
    assert me_resp.json()["full_name"] == full_name

