import { MemberModel } from './members.model';

export default class MembersServices {
  static async getInitialOrganizationId(
    userId: string
  ): Promise<string | undefined> {
    const member = await MemberModel.findOne({ userId });
    return member?.organizationId;
  }
}
