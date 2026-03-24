package com.scroogebank.crm.userservice.exception;
import com.scroogebank.crm.userservice.security.ForbiddenException;

public class AccessDeniedException extends ForbiddenException {
    public AccessDeniedException(String message) {
        super(message);
    }
}
