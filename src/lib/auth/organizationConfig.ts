import { OrganizationOptions } from 'better-auth/plugins';
import { sendOrganizationInvitationEmail } from '@/configs/emailTemplates';
import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  adminAc,
  ownerAc,
  memberAc,
} from 'better-auth/plugins/organization/access';
import { verifyGst } from '../gst';
import { APIError } from 'better-auth/api';
import { logger } from 'better-auth';
import { UserModel } from '@/modules/auth/users/users.model';
import env from '@/configs/env';
import COAServices from '@/modules/accounting/coa/coa.services';
import { OrganizationModel } from '@/modules/auth/organisations/organizations.model';

const organisationStatements = {
  coa: ['create', 'read', 'update', 'delete', 'readAll'],
  journel: [
    'create',
    'read',
    'update',
    'delete',
    'readAll',
    'post',
    'reverse',
    'validate',
  ],
  payment: ['create', 'read', 'update', 'delete', 'readAll'],
  gst: ['create', 'read', 'update', 'delete', 'readAll'],
  inventory: ['create', 'read', 'update', 'delete', 'readAll'],
  items: ['create', 'read', 'update', 'delete', 'readAll'],
  stock: ['create', 'read', 'update', 'delete', 'readAll'],
  bill: ['create', 'read', 'update', 'delete', 'readAll'],
  invoice: ['create', 'read', 'update', 'delete', 'readAll'],
  contacts: ['create', 'read', 'update', 'delete', 'readAll'],
  vendors: ['create', 'read', 'update', 'delete', 'readAll'],
  customers: ['create', 'read', 'update', 'delete', 'readAll'],
  employees: ['create', 'read', 'update', 'delete', 'readAll'],
  projects: ['create', 'read', 'update', 'delete', 'readAll'],
  tasks: ['create', 'read', 'update', 'delete', 'readAll'],
  events: ['create', 'read', 'update', 'delete', 'readAll'],
  documents: ['create', 'read', 'update', 'delete', 'readAll'],
};

export const statement = {
  ...defaultStatements,
  ...organisationStatements,
} as const;

const ac = createAccessControl(statement);

const creator = ac.newRole({
  ...ownerAc.statements,
  ...organisationStatements,
});

const ca = ac.newRole({
  ...adminAc.statements,
  ...organisationStatements,
});

const owner = ac.newRole({
  ...adminAc.statements,
  ...organisationStatements,
});

const staff = ac.newRole({
  ...memberAc.statements,
  coa: ['create', 'read', 'update'],
  journel: ['create', 'read', 'update', 'post', 'readAll', 'validate'],
});

const organisation: OrganizationOptions = {
  /** CA and Owner can both create organizations; Staff cannot */
  allowUserToCreateOrganization: async (user) => {
    if (user.role === 'ca' || user.role === 'admin' || user.role === 'owner') {
      return true;
    }
    return false;
  },
  requireEmailVerificationOnInvitation: true,
  async sendInvitationEmail(data, request) {
    // Generate invite link based on user present in our system or not
    const isUserPresent = await UserModel.findOne({ email: data.email });
    let inviteLink = '';
    if (isUserPresent) {
      inviteLink = `${env.FRONTEND_URL}/auth/organization/invitation/${data.id}`;
    } else {
      inviteLink = `${env.FRONTEND_URL}/auth/signup?redirectTo=/auth/organization/invitation/${data.id}`;
    }
    sendOrganizationInvitationEmail(data.email, {
      invitedByUsername: data.inviter.user.name,
      invitedByEmail: data.inviter.user.email,
      teamName: data.organization.name,
      inviteLink,
    });
  },
  schema: {
    organization: {
      additionalFields: {
        gstin: {
          type: 'string',
        },
        industry: {
          type: 'string',
        },
        pan: {
          type: 'string',
        },
        financialYearStart: {
          type: 'string',
        },
        assignedRoleCA: {
          type: 'string',
          required: false,
        },
        assignedRoleOwner: {
          type: 'string',
          required: false,
        },
        orgCode: {
          type: 'string',
          unique: true,
        },
      },
    },
  },
  ac,
  roles: {
    creator,
    ca,
    owner,
    staff,
  },
  creatorRole: 'creator',
  organizationHooks: {
    beforeCreateOrganization: async ({ organization, user }) => {
      try {
        // Verify GSTIN
        const gstin = organization.gstin;
        if (gstin) {
          // First Regex Check GSTIN
          const gstinRegex =
            /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
          if (!gstinRegex.test(gstin)) {
            logger.error('Invalid GSTIN Format', {
              type: organization.gstin,
            });
            throw new APIError('BAD_REQUEST', {
              message: 'Invalid GSTIN Format',
              code: 'INVALID_GSTIN_FORMAT',
              cause: 'The GSTIN format is invalid',
            });
          }
          // Then Verify with API
          const gstResponse = await verifyGst({ gstin });
          if (!gstResponse.isValid) {
            logger.error('Invalid GSTIN Verification with API', {
              type: organization.gstin,
            });
            throw new APIError('BAD_REQUEST', {
              message: 'Invalid GSTIN Verification with API',
              code: 'INVALID_GSTIN_VERIFICATION_WITH_API',
              cause: 'The GSTIN verification with API failed',
            });
          }
          organization.gstin = gstResponse.gstin;
        }

        // Verify PAN Get the PAN	Take digits 3 to 12 of the GSTIN and pan should match with the GSTIN
        const pan = organization.pan;
        if (pan) {
          const gstinDigits = gstin.slice(2, 12);
          if (pan !== gstinDigits) {
            logger.error('Invalid PAN Verification with GSTIN', {
              type: organization.gstin,
            });
            throw new APIError('BAD_REQUEST', {
              message: 'Invalid PAN Verification with GSTIN',
              code: 'INVALID_PAN_VERIFICATION_WITH_GSTIN',
              cause: 'The PAN verification with GSTIN failed',
            });
          }
        }

        // If no PAN then add pan from gstin
        if (!organization.pan) {
          organization.pan = gstin.slice(2, 12);
        }

        // Verify Financial Year Start
        const financialYearStart = organization.financialYearStart;
        if (financialYearStart) {
          const financialYearStartRegex = /^[0-9]{4}-[0-9]{4}$/;
          if (!financialYearStartRegex.test(financialYearStart)) {
            logger.error('Invalid Financial Year Start Format', {
              type: organization.financialYearStart,
            });
            throw new APIError('BAD_REQUEST', {
              message: 'Invalid Financial Year Start Format',
              code: 'INVALID_FINANCIAL_YEAR_START_FORMAT',
              cause: 'The Financial Year Start format is invalid',
            });
          }
        }

        if (user.role === 'ca') {
          organization.assignedRoleCA = user.id;
        } else if (user.role === 'owner') {
          organization.assignedRoleOwner = user.id;
        }

        return {
          data: {
            ...organization,
          },
        };
      } catch (error) {
        throw error;
      }
    },

    afterCreateOrganization: async ({ organization, user }) => {
      try {
        // Create COA template
        const coaTemplate = COAServices.getTemplateByIndustry(
          organization.industry
        );
        const createdAccounts = await COAServices.createFromTemplate({
          organizationId: organization.id,
          userId: user.id,
          accounts: coaTemplate,
        });
        logger.info('COA template created', {
          organizationId: organization.id,
          userId: user.id,
          createdAccounts,
        });
        // Create event templates from industry template (same industries as COA)
        try {
          const { default: EventTemplateService } = await import(
            '@/modules/accounting/events/template.service'
          );
          const industry = organization.industry as
            | 'retail'
            | 'serviceBased'
            | 'manufacturing';
          const { created, failures } =
            await EventTemplateService.createFromTemplate({
              organizationId: organization.id,
              industry: industry ?? 'retail',
            });
          logger.info('Event templates created from template', {
            organizationId: organization.id,
            created: created.length,
            failures: failures.length ? failures : undefined,
          });
        } catch (err) {
          logger.warn('Failed to create event templates from template', {
            organizationId: organization.id,
            err,
          });
        }
      } catch (error) {
        throw error;
      }
    },

    afterAcceptInvitation: async ({ member, user, organization }) => {
      try {
        // Chheck if role is not CA or OWNER then return
        if (member.role === 'staff') {
          return;
        }

        // Update assigned role for CA or OWNER
        if (member.role === 'ca') {
          organization.assignedRoleCA = user.id;
        } else if (member.role === 'owner') {
          organization.assignedRoleOwner = user.id;
        }

        // Update organization with assigned role
        const updatedOrganization = await OrganizationModel.findByIdAndUpdate(
          organization.id,
          {
            assignedRoleCA: organization.assignedRoleCA,
            assignedRoleOwner: organization.assignedRoleOwner,
          }
        );

        if (!updatedOrganization) {
          throw new APIError('BAD_REQUEST', {
            message: 'Failed to update organization',
            code: 'FAILED_TO_UPDATE_ORGANIZATION',
            cause: 'The organization update failed',
          });
        }
      } catch (error) {
        throw error;
      }
    },
  },
};

export default organisation;
