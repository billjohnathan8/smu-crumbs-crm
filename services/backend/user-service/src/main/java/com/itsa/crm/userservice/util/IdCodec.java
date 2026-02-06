package com.itsa.crm.userservice.util;

/**
 * Encodes and decodes string identifiers with a fixed prefix.
 */
public final class IdCodec {
	private IdCodec() {}

	/**
	 * Encodes a numeric id by prepending the prefix.
	 *
	 * @param prefix prefix to prepend
	 * @param id numeric id
	 * @return encoded id
	 */
	public static String encode(String prefix, long id) {
		return prefix + id;
	}

	/**
	 * Decodes a prefixed identifier into its numeric id.
	 *
	 * @param prefix expected prefix
	 * @param value encoded id
	 * @return numeric id
	 * @throws IllegalArgumentException when the prefix is missing
	 * @throws NumberFormatException when the suffix is not a number
	 */
	public static long decode(String prefix, String value) {
		if (value == null || !value.startsWith(prefix)) {
			throw new IllegalArgumentException("invalid id");
		}
		String suffix = value.substring(prefix.length());
		return Long.parseLong(suffix);
	}
}
