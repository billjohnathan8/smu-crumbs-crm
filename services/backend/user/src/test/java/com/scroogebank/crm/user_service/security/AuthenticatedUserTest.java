package com.scroogebank.crm.user_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.scroogebank.crm.user_service.dto.UserRole;
import org.junit.jupiter.api.Test;

class AuthenticatedUserTest {

	@Test
	void canonicalConstructor_setsFields() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", UserRole.admin);
		assertEquals("usr_1", user.userId());
		assertEquals(UserRole.admin, user.role());
	}

	@Test
	void canonicalConstructor_rejectsNullUserId() {
		assertThrows(NullPointerException.class, () -> new AuthenticatedUser(null, UserRole.admin));
	}

	@Test
	void canonicalConstructor_rejectsNullRole() {
		assertThrows(NullPointerException.class, () -> new AuthenticatedUser("usr_1", (UserRole) null));
	}

	@Test
	void stringConstructor_parsesAdmin() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "admin");
		assertEquals(UserRole.admin, user.role());
	}

	@Test
	void stringConstructor_parsesUser() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "user");
		assertEquals(UserRole.user, user.role());
	}

	@Test
	void stringConstructor_parsesSuperAdmin() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "super_admin");
		assertEquals(UserRole.super_admin, user.role());
	}

	@Test
	void stringConstructor_parsesSuperadminAlias() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "superadmin");
		assertEquals(UserRole.super_admin, user.role());
	}

	@Test
	void stringConstructor_parsesSuperDashAdmin() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "super-admin");
		assertEquals(UserRole.super_admin, user.role());
	}

	@Test
	void stringConstructor_caseInsensitive() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "ADMIN");
		assertEquals(UserRole.admin, user.role());
	}

	@Test
	void stringConstructor_nullRole_throws() {
		assertThrows(IllegalArgumentException.class, () -> new AuthenticatedUser("usr_1", (String) null));
	}

	@Test
	void stringConstructor_unknownRole_throws() {
		assertThrows(IllegalArgumentException.class, () -> new AuthenticatedUser("usr_1", "auditor"));
	}

	@Test
	void isSuperAdmin_trueForSuperAdmin() {
		assertTrue(new AuthenticatedUser("u", UserRole.super_admin).isSuperAdmin());
	}

	@Test
	void isSuperAdmin_falseForAdmin() {
		assertFalse(new AuthenticatedUser("u", UserRole.admin).isSuperAdmin());
	}

	@Test
	void isAdmin_trueForAdmin() {
		assertTrue(new AuthenticatedUser("u", UserRole.admin).isAdmin());
	}

	@Test
	void isAdmin_falseForUser() {
		assertFalse(new AuthenticatedUser("u", UserRole.user).isAdmin());
	}

	@Test
	void isUser_trueForUser() {
		assertTrue(new AuthenticatedUser("u", UserRole.user).isUser());
	}

	@Test
	void isUser_falseForAdmin() {
		assertFalse(new AuthenticatedUser("u", UserRole.admin).isUser());
	}
}
