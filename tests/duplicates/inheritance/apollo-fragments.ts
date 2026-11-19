// Apollo — fragment composition: BaseUser ⊂ AdminUser ⊂ ExtendedAdmin.
import { gql } from "@apollo/client";

export const BaseUserFragment = gql`
	fragment BaseUser on User {
		id
		name
		email
	}
`;

export const AdminUserFragment = gql`
	fragment AdminUser on User {
		...BaseUser
		role
		createdAt
	}

	${BaseUserFragment}
`;

export const ExtendedAdminFragment = gql`
	fragment ExtendedAdmin on User {
		...AdminUser
		posts {
			id
			title
		}
	}

	${AdminUserFragment}
`;

export const GET_ADMINS = gql`
	query GetAdmins {
		users(where: { role: { equals: "admin" } }) {
			...ExtendedAdmin
		}
	}

	${ExtendedAdminFragment}
`;
