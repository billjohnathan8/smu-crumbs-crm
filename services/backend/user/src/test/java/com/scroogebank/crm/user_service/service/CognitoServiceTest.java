package com.scroogebank.crm.user_service.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserResponse;
import software.amazon.awssdk.services.cognitoidentityprovider.model.DeliveryMediumType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.MessageActionType;

class CognitoServiceTest {
	private CognitoIdentityProviderClient cognitoClient;
	private CognitoService cognitoService;

	@BeforeEach
	void setUp() throws Exception {
		cognitoClient = mock(CognitoIdentityProviderClient.class);
		cognitoService = new CognitoService(cognitoClient);
		setPrivateField(cognitoService, "userPoolId", "test-pool-id");
		when(cognitoClient.adminCreateUser(any(AdminCreateUserRequest.class)))
			.thenReturn(AdminCreateUserResponse.builder().build());
	}

	@Test
	void createUser_sendInviteEnabled_usesEmailDelivery() {
		cognitoService.createUser("ava@example.com", "Ava Stone", "USER", "Tmp!1234Abcd", true);

		ArgumentCaptor<AdminCreateUserRequest> captor = ArgumentCaptor.forClass(AdminCreateUserRequest.class);
		verify(cognitoClient).adminCreateUser(captor.capture());

		AdminCreateUserRequest request = captor.getValue();
		assertEquals("test-pool-id", request.userPoolId());
		assertEquals("ava@example.com", request.username());
		assertEquals("Tmp!1234Abcd", request.temporaryPassword());
		assertEquals(DeliveryMediumType.EMAIL, request.desiredDeliveryMediums().get(0));
		assertNull(request.messageAction());
	}

	@Test
	void createUser_sendInviteDisabled_suppressesMessageDelivery() {
		cognitoService.createUser("ava@example.com", "Ava Stone", "USER", "Tmp!1234Abcd", false);

		ArgumentCaptor<AdminCreateUserRequest> captor = ArgumentCaptor.forClass(AdminCreateUserRequest.class);
		verify(cognitoClient).adminCreateUser(captor.capture());

		AdminCreateUserRequest request = captor.getValue();
		assertEquals(MessageActionType.SUPPRESS, request.messageAction());
	}

	private static void setPrivateField(Object target, String fieldName, String value) throws Exception {
		Field field = target.getClass().getDeclaredField(fieldName);
		field.setAccessible(true);
		field.set(target, value);
	}
}
