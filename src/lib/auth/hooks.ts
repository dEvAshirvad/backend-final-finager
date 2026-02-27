import { BetterAuthOptions } from 'better-auth';
import MembersServices from '@/modules/auth/members/members.services';

export const authHooks: BetterAuthOptions['hooks'] = {};

export const authDbHooks: BetterAuthOptions['databaseHooks'] = {
  session: {
    create: {
      before: async (session) => {
        const organizationId = await MembersServices.getInitialOrganizationId(
          session.userId
        );
        return {
          data: {
            ...session,
            ...(organizationId
              ? {
                  activeOrganizationId: organizationId,
                }
              : {}), // If organization is not found, don't set activeOrganizationId
          },
        };
      },
    },
  },
};
