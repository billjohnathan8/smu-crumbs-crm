package com.itsa.crm.userservice.dto;

public record UserDto(
    String userId,
    String firstName,
    String lastName,
    String email,
    String role
) {}