package com.scroogebank.crm.user_service.service;

import com.scroogebank.crm.user_service.exception.DuplicateUserException;
import com.scroogebank.crm.user_service.exception.ExternalProvisioningException;
import com.scroogebank.crm.user_service.exception.PasswordPolicyViolationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminAddUserToGroupRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminCreateUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.DeliveryMediumType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDeleteUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDisableUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminEnableUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminResetUserPasswordRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.InvalidParameterException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.InvalidPasswordException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.MessageActionType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.ResourceNotFoundException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UsernameExistsException;

@Service
@ConditionalOnProperty(name = "aws.cognito.user-pool-id")
public class CognitoService {

    private final CognitoIdentityProviderClient cognitoClient;

    @Value("${aws.cognito.user-pool-id}")
    private String userPoolId;

    @Value("${aws.cognito.client-id}")
    private String clientId;

    public CognitoService(CognitoIdentityProviderClient cognitoClient) {
        this.cognitoClient = cognitoClient;
    }

    public void createUser(
        String email,
        String name,
        String groupName,
        String temporaryPassword,
        boolean sendInviteEmail
    ) {
        try {
            AdminCreateUserRequest.Builder builder = AdminCreateUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(email)
                    .userAttributes(
                            AttributeType.builder().name("email").value(email).build(),
                            AttributeType.builder().name("name").value(name).build(),
                            AttributeType.builder().name("email_verified").value("false").build()
                    );

            if (sendInviteEmail) {
                builder.desiredDeliveryMediums(DeliveryMediumType.EMAIL);
            } else {
                builder.messageAction(MessageActionType.SUPPRESS);
            }

            if (temporaryPassword != null && !temporaryPassword.isBlank()) {
                builder.temporaryPassword(temporaryPassword);
            }

            cognitoClient.adminCreateUser(builder.build());
            // log.info("Created Cognito user: {}", email);

            addUserToGroup(email, groupName);
            // log.info("Added Cognito user {} to group {}", email, groupName);

        } catch (UsernameExistsException e) {
            throw new DuplicateUserException("Email already exists.");
        } catch (InvalidPasswordException | InvalidParameterException e) {
            String reason = null;
            if (e.awsErrorDetails() != null) {
                reason = e.awsErrorDetails().errorMessage();
            }
            if (reason == null || reason.isBlank()) {
                reason = "Temporary password does not meet policy requirements.";
            }
            throw new PasswordPolicyViolationException(reason);
        } catch (ResourceNotFoundException e) {
            throw new ExternalProvisioningException("Identity provisioning is not fully configured.", e);
        } catch (CognitoIdentityProviderException e) {
            // log.error("Failed to create Cognito user: {}", e.awsErrorDetails().errorMessage());
            throw new ExternalProvisioningException("Identity provisioning failed.", e);
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

    // Called on archiveUser / disableUser
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

    // Called on reinstateUser
    public void enableUser(String email) {
        try {
            AdminEnableUserRequest request = AdminEnableUserRequest.builder()
                    .userPoolId(userPoolId)
                    .username(email)
                    .build();

            cognitoClient.adminEnableUser(request);

        } catch (CognitoIdentityProviderException e) {
            throw new RuntimeException("Failed to enable user in Cognito", e);
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
