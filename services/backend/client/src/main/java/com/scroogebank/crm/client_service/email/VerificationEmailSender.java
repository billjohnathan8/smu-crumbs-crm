package com.scroogebank.crm.client_service.email;

/**
 * Abstraction for sending client verification emails through a configured provider.
 */
public interface VerificationEmailSender {
	/**
	 * Sends a verification email.
	 *
	 * @param email outbound email payload
	 * @return provider message identifier where available
	 */
	String send(VerificationEmail email);
}
