import { Response, Request } from 'express';
import { UserModel } from '../users/users.model';
import Respond from '@/lib/respond';
import { OrganizationModel } from '../organisations/organizations.model';
import { MemberModel } from '../members/members.model';
import mongoose from 'mongoose';
import { SessionModel } from '../sessions/sessions.model';

export default class OnboardingHandler {
  static async chooseRole(req: Request, res: Response) {
    try {
      const { role } = req.body;
      const user = req.user;

      // Check if user is already assigned a role
      if (user?.role && user?.role !== 'user') {
        return Respond(res, { message: 'User already has a role' }, 400);
      }

      // Role can only be CA, OWNER, STAFF
      if (!['ca', 'owner', 'staff'].includes(role)) {
        return Respond(res, { message: 'Invalid role' }, 400);
      }

      const updatedUser = await UserModel.findByIdAndUpdate(user?.id, { role });
      if (!updatedUser) {
        return Respond(res, { message: 'Failed to update user role' }, 400);
      }
      return Respond(res, { message: 'Role chosen successfully' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async verifyCa(req: Request, res: Response) {
    try {
      const { caId } = req.body;
      const user = req.user;

      // Check if user is a ca
      if (user?.role !== 'ca') {
        return Respond(res, { message: 'User is not a ca' }, 400);
      }
      // Check if user is already has verified a caId
      if (user?.caId && user?.caId !== '' && user?.caId !== undefined) {
        return Respond(
          res,
          { message: 'User already has a verified caId' },
          400
        );
      }

      // Enter ICAI membership number (store, but no real verification in MVP)
      const updatedUser = await UserModel.findByIdAndUpdate(user?.id, { caId });
      if (!updatedUser) {
        return Respond(res, { message: 'Failed to update user caId' }, 400);
      }
      return Respond(res, { message: 'CA ID verified successfully' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async getOnboardingStatus(req: Request, res: Response) {
    try {
      const user = req.user;
      // Check if user have either name or image
      if (!user?.name || !user?.image) {
        return Respond(res, { message: 'User has no name or image' }, 400);
      }

      // Check if user has a role and it should be CA, OWNER, or STAFF
      if (!user?.role || !['ca', 'owner', 'staff'].includes(user?.role)) {
        return Respond(res, { message: 'User has an invalid role' }, 400);
      }

      // Check if user has a caId if role is CA
      if (user?.role === 'ca' && !user?.caId) {
        return Respond(res, { message: 'User has no caId' }, 400);
      }

      // Check if user is member of any organization
      const isMember = await MemberModel.findOne({
        userId: user?.id,
        role: user?.role,
      });
      if (!isMember) {
        return Respond(
          res,
          {
            message: 'User is not a member of any organization',
          },
          400
        );
      }

      // Check if user is onboarded
      if (user?.isOnboarded) {
        return Respond(res, { message: 'Onboarding status: Completed' }, 200);
      }

      return Respond(res, { message: 'Onboarding status: In Progress' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async generateOrgCode(req: Request, res: Response) {
    try {
      const { name, slug } = req.body;
      const prefix =
        name?.slice(0, 3).toUpperCase() ||
        slug?.slice(0, 3).toUpperCase() ||
        'ORG';

      // Try a few times to find a unique orgCode
      let orgCode: string | null = null;
      const maxAttempts = 10;

      for (let i = 0; i < maxAttempts; i++) {
        const candidate =
          prefix + Math.floor(1000 + Math.random() * 9000).toString();

        // Check uniqueness against existing organizations
        // eslint-disable-next-line no-await-in-loop
        const existing = await OrganizationModel.findOne({
          orgCode: candidate,
        });

        if (!existing) {
          orgCode = candidate;
          break;
        }
      }

      if (!orgCode) {
        return Respond(
          res,
          { message: 'Unable to generate unique organization code' },
          500
        );
      }

      return Respond(
        res,
        {
          message: 'Organization code generated successfully',
          orgCode,
        },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async checkOrgCodeAvailability(req: Request, res: Response) {
    try {
      const { orgCode } = req.body;
      const existingOrgCode = await OrganizationModel.findOne({ orgCode });
      if (existingOrgCode) {
        return Respond(
          res,
          { message: 'Organization code is not available' },
          400
        );
      }
      return Respond(res, { message: 'Organization code is available' }, 200);
    } catch (error) {
      throw error;
    }
  }

  static async completeOnboarding(req: Request, res: Response) {
    try {
      const user = req.user;
      const { organizationId } = req.body;
      // Check if user is onboarded
      if (user?.isOnboarded) {
        return Respond(res, { message: 'User is already onboarded' }, 400);
      }

      // Check if user has a role and it should be CA, OWNER, or STAFF
      if (
        !user?.role ||
        !['ca', 'owner', 'staff', 'creator'].includes(user?.role)
      ) {
        return Respond(res, { message: 'User has an invalid role' }, 400);
      }

      // Check if user has a caId if role is CA
      if (user?.role === 'ca' && !user?.caId) {
        return Respond(res, { message: 'User has no caId' }, 400);
      }

      const isMember = await MemberModel.findOne({
        userId: user?.id,
        organizationId,
      });
      if (!isMember) {
        return Respond(
          res,
          {
            message:
              'User is not a member of the organization with the required role',
          },
          400
        );
      }

      await UserModel.findByIdAndUpdate(user?.id, { isOnboarded: true });
      return Respond(
        res,
        { message: 'Onboarding completed successfully' },
        200
      );
    } catch (error) {
      throw error;
    }
  }

  static async setActiveOrganization(req: Request, res: Response) {
    try {
      const { organizationId, organizationSlug } = req.body;
      const user = req.user;
      if (!organizationId && !organizationSlug) {
        return Respond(
          res,
          { message: 'Organization ID or slug is required' },
          400
        );
      }

      const organization = await OrganizationModel.findOne({
        $or: [{ _id: organizationId }, { slug: organizationSlug }],
      });
      if (!organization) {
        return Respond(res, { message: 'Organization not found' }, 400);
      }
      await SessionModel.findByIdAndUpdate(user?.id, {
        activeOrganizationId: organization.id,
      });
      return Respond(
        res,
        { message: 'Active organization set successfully' },
        200
      );
    } catch (error) {
      throw error;
    }
  }
}
