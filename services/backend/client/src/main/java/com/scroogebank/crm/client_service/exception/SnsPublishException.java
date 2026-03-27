package com.scroogebank.crm.client_service.exception;

public class SnsPublishException extends RuntimeException {
    public SnsPublishException(String message) {
        super(message);
    }

    public SnsPublishException(String message, Throwable cause) {
        super(message, cause);
    }
}
