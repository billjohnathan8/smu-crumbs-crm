package com.scroogebank.crm.user_service.exception;
import com.scroogebank.crm.user_service.security.ForbiddenException;

public class AccessDeniedException extends ForbiddenException {
    public AccessDeniedException(String message) {
        super(message);
    }
}
