package com.scroogebank.crm.agentservice.exception;
import com.scroogebank.crm.agentservice.security.ForbiddenException;

public class AccessDeniedException extends ForbiddenException {
    public AccessDeniedException(String message) {
        super(message);
    }
}
