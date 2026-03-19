package com.scroogebank.crm.userservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.scroogebank.crm.userservice.dto.CreateUserRequest;
import com.scroogebank.crm.userservice.dto.UserDto;
import com.scroogebank.crm.userservice.dto.UserRole;
import com.scroogebank.crm.userservice.repository.RefreshTokenRepository;
import com.scroogebank.crm.userservice.repository.UserRepository;
import java.time.Clock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

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
}
