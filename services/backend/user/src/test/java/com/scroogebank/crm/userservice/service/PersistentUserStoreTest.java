package com.scroogebank.crm.userservice.service;

import java.time.Clock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.scroogebank.crm.userservice.dto.CreateUserRequest;
import com.scroogebank.crm.userservice.dto.UserDto;
import com.scroogebank.crm.userservice.dto.UserRole;
import com.scroogebank.crm.userservice.repository.RefreshTokenRepository;
import com.scroogebank.crm.userservice.repository.UserRepository;

/**
 * Verifies persisted user/refresh-token state survives store recreation.
 */
@SpringBootTest(properties = {
	"app.user-store.type=postgres",
	"app.root-admin.email=root@example.com",
	"app.root-admin.password=RootPass!123"
})
class PersistentUserStoreTest {
	@Autowired
	private UserStore store;

	@Autowired
	private UserRepository userRepository;

	@Autowired
	private RefreshTokenRepository refreshTokenRepository;

	@Autowired
	private PasswordHasher passwordHasher;

	@Autowired
	private Clock clock;

	@BeforeEach
	void setUp() {
		refreshTokenRepository.deleteAll();
		userRepository.deleteAll();
	}

	@Test
	void refreshTokenPersistsAcrossStoreInstance() {
		UserDto created = store.createUser(
			new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123")
		);
		String token = store.issueRefreshToken(created.id());

		PersistentUserStore recreated = new PersistentUserStore(
			clock,
			passwordHasher,
			userRepository,
			refreshTokenRepository,
			"root@example.com",
			"RootPass!123"
		);

		assertTrue(recreated.isRefreshTokenValid(token));
		assertEquals(created.id(), recreated.userIdForRefreshToken(token));
	}

	@Test
	void resetPasswordToken_isOneTimeAndRevokesRefreshTokens() {
		UserDto created = store.createUser(
			new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123")
		);
		String refreshToken = store.issueRefreshToken(created.id());
		String resetToken = store.createPasswordResetToken("ava@example.com");

		assertNotNull(resetToken);
		store.resetPasswordWithToken(resetToken, "NewPass!123");

		assertFalse(store.isRefreshTokenValid(refreshToken));
		assertTrue(store.verifyPassword(store.findByEmail("ava@example.com"), "NewPass!123"));
		assertThrows(IllegalArgumentException.class, () -> store.resetPasswordWithToken(resetToken, "OtherPass!123"));
	}

	@Test
	void latestResetToken_notExposedOutsideLocalOrTestProfiles() {
		store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123"));
		store.createPasswordResetToken("ava@example.com");
		assertNull(store.getLatestResetToken("ava@example.com"));
	}
}
