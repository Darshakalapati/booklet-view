from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

User = get_user_model()

PASSWORD = "ledger-Pages-42"


class AccountTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser("boss", "boss@example.com", PASSWORD)
        self.user = User.objects.create_user("ravi", password=PASSWORD)

    def login(self, username, password=PASSWORD):
        return self.client.post("/api/auth/login/", {"username": username, "password": password})

    def test_superuser_gets_admin_role(self):
        self.assertEqual(self.admin.role, "admin")
        self.assertTrue(self.admin.is_booklet_admin)
        self.assertFalse(self.user.is_booklet_admin)

    def test_login_returns_token_that_works(self):
        response = self.login("ravi")
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.data["username"], "ravi")
        self.assertEqual(me.data["role"], "user")
        self.assertNotIn("password", me.data)

    def test_wrong_password_is_rejected(self):
        self.assertEqual(self.login("ravi", "nope").status_code, 400)

    def test_everything_needs_a_login(self):
        for url in ("/api/auth/me/", "/api/books/", "/api/users/", "/api/trash/"):
            self.assertEqual(self.client.get(url).status_code, 401, url)

    def test_logout_ends_the_token(self):
        token = self.login("ravi").data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_change_password(self):
        self.client.force_authenticate(self.user)
        bad = self.client.post("/api/auth/change-password/", {"current_password": "x", "new_password": "another-Pass-77"})
        self.assertEqual(bad.status_code, 400)
        good = self.client.post(
            "/api/auth/change-password/", {"current_password": PASSWORD, "new_password": "another-Pass-77"}
        )
        self.assertEqual(good.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.login("ravi", "another-Pass-77").status_code, 200)

    def test_only_admin_manages_users(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(self.client.post("/api/users/", {"username": "x", "password": PASSWORD}).status_code, 403)

        self.client.force_authenticate(self.admin)
        created = self.client.post("/api/users/", {"username": "sita", "password": PASSWORD})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["role"], "user")
        self.assertTrue(User.objects.get(username="sita").check_password(PASSWORD))
        self.assertEqual(len(self.client.get("/api/users/").data), 3)

    def test_admin_can_switch_a_user_off_and_on(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/users/{self.user.pk}/", {"is_active": False})
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(None)
        self.assertEqual(self.login("ravi").status_code, 400)

    def test_admin_cannot_lock_themselves_out(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"role": "user"}).status_code, 400)
        self.assertEqual(self.client.patch(f"/api/users/{self.admin.pk}/", {"is_active": False}).status_code, 400)

    def test_weak_password_is_refused(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/users/", {"username": "weak", "password": "12345"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)
