package com.scroogebank.crm.user_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminAddUserToGroupRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserResponse;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.DeliveryMediumType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.MessageActionType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.ResendConfirmationCodeRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UsernameExistsException;

import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDeleteUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDisableUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminResetUserPasswordRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException;

public class CognitoService {

    private final CognitoIdentityProviderClient cognitoClient;

    @Value("${aws.cognito.user-pool-id}")
    private String userPoolId;

    @Value("${aws.cognito.client-id}")
    private String clientId;

    public CognitoService(CognitoIdentityProviderClient cognitoClient) {
        this.cognitoClient = cognitoClient;
    }

    // Called on createUser — works for both ADMIN and USER groups
    public void createUser(String email, String name, String groupName) {
        try {
            AdminCreateUserRequest createRequest = AdminCreateUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(email)
                    .userAttributes(
                            AttributeType.builder().name("email").value(email).build(),
                            AttributeType.builder().name("name").value(name).build(),
                            AttributeType.builder().name("email_verified").value("false").build()
                    )
                    .desiredDeliveryMediums(DeliveryMediumType.EMAIL)
                    .build();

            cognitoClient.adminCreateUser(createRequest);
            // log.info("Created Cognito user: {}", email);

            addUserToGroup(email, groupName);
            // log.info("Added Cognito user {} to group {}", email, groupName);

        } catch (UsernameExistsException e) {
            throw new RuntimeException("User already exists in Cognito: " + email, e);
        } catch (CognitoIdentityProviderException e) {
            // log.error("Failed to create Cognito user: {}", e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to create user in Cognito", e);
        }
    }

    // Called on deleteUser
    public void deleteUser(String email) {
        try {
            AdminDeleteUserRequest request = AdminDeleteUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(email)
                    .build();

            cognitoClient.adminDeleteUser(request);
            // log.info("Deleted Cognito user: {}", email);

        } catch (UserNotFoundException e) {
            // log.warn("User not found in Cognito during delete, skipping: {}", email);
        } catch (CognitoIdentityProviderException e) {
            // log.error("Failed to delete Cognito user: {}", e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to delete user in Cognito", e);
        }
    }

    // Called on disableUser
    public void disableUser(String email) {
        try {
            AdminDisableUserRequest request = AdminDisableUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(email)
                    .build();

            cognitoClient.adminDisableUser(request);
            // log.info("Disabled Cognito user: {}", email);

        } catch (CognitoIdentityProviderException e) {
            // log.error("Failed to disable Cognito user: {}", e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to disable user in Cognito", e);
        }
    }

    // Called on resetPassword — Cognito sends a new temp password email
    public void resetPassword(String email) {
        try {
            AdminResetUserPasswordRequest request = AdminResetUserPasswordRequest.builder()
                    .userPoolId(userPoolId)
                    .username(email)
                    .build();

            cognitoClient.adminResetUserPassword(request);
            // log.info("Reset Cognito password for user: {}", email);

        } catch (CognitoIdentityProviderException e) {
            // log.error("Failed to reset Cognito password: {}", e.awsErrorDetails().errorMessage());
            throw new RuntimeException("Failed to reset password in Cognito", e);
        }
    }

    private void addUserToGroup(String email, String groupName) {
        AdminAddUserToGroupRequest request = AdminAddUserToGroupRequest.builder()
                .userPoolId(userPoolId)
                .username(email)
                .groupName(groupName)
                .build();

        cognitoClient.adminAddUserToGroup(request);
    }
}