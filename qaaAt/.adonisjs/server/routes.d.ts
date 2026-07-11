import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'public_hall.index': { paramsTuple?: []; params?: {} }
    'public_hall.cities': { paramsTuple?: []; params?: {} }
    'public_hall.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_hall.availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_auth.register': { paramsTuple?: []; params?: {} }
    'user_auth.login': { paramsTuple?: []; params?: {} }
    'user_auth.me': { paramsTuple?: []; params?: {} }
    'user_auth.logout': { paramsTuple?: []; params?: {} }
    'user_push_installations.store': { paramsTuple?: []; params?: {} }
    'user_push_installations.destroy': { paramsTuple: [ParamValue]; params: {'installationId': ParamValue} }
    'user_auth.verify_email': { paramsTuple?: []; params?: {} }
    'user_auth.resend_verification': { paramsTuple?: []; params?: {} }
    'users.notification.index': { paramsTuple?: []; params?: {} }
    'users.notification.unreadCount': { paramsTuple?: []; params?: {} }
    'users.notification.markAsRead': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.notification.markAllAsRead': { paramsTuple?: []; params?: {} }
    'user_booking.index': { paramsTuple?: []; params?: {} }
    'user_booking.store': { paramsTuple?: []; params?: {} }
    'user_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_auth.register': { paramsTuple?: []; params?: {} }
    'company_auth.login': { paramsTuple?: []; params?: {} }
    'company_auth.me': { paramsTuple?: []; params?: {} }
    'company_auth.logout': { paramsTuple?: []; params?: {} }
    'company_members.index': { paramsTuple?: []; params?: {} }
    'company_members.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_members.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_invitations.index': { paramsTuple?: []; params?: {} }
    'company_invitations.store': { paramsTuple?: []; params?: {} }
    'company_invitations.resend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_invitations.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'push_installations.store': { paramsTuple?: []; params?: {} }
    'push_installations.destroy': { paramsTuple: [ParamValue]; params: {'installationId': ParamValue} }
    'companies.notification.index': { paramsTuple?: []; params?: {} }
    'companies.notification.unreadCount': { paramsTuple?: []; params?: {} }
    'companies.notification.markAsRead': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'companies.notification.markAllAsRead': { paramsTuple?: []; params?: {} }
    'company_booking.index': { paramsTuple?: []; params?: {} }
    'company_booking.pending': { paramsTuple?: []; params?: {} }
    'company_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_booking.accept': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_booking.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'hall.index': { paramsTuple?: []; params?: {} }
    'hall.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'hall.store': { paramsTuple?: []; params?: {} }
    'hall.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'hall.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_auth.login': { paramsTuple?: []; params?: {} }
    'admin_auth.me': { paramsTuple?: []; params?: {} }
    'admin_auth.logout': { paramsTuple?: []; params?: {} }
    'admin.get_statistics': { paramsTuple?: []; params?: {} }
    'admin.get_users': { paramsTuple?: []; params?: {} }
    'admin.get_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.ban_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.unban_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_companies': { paramsTuple?: []; params?: {} }
    'admin.get_pending_companies': { paramsTuple?: []; params?: {} }
    'admin.get_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.ban_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.unban_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.approve_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.reject_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.suspend_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.reactivate_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_halls': { paramsTuple?: []; params?: {} }
    'admin.delete_hall': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_bookings': { paramsTuple?: []; params?: {} }
    'admin.delete_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'health_checks': { paramsTuple?: []; params?: {} }
    'health_checks.live': { paramsTuple?: []; params?: {} }
    'public_company_invitations.inspect': { paramsTuple?: []; params?: {} }
    'public_company_invitations.accept': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'public_hall.index': { paramsTuple?: []; params?: {} }
    'public_hall.cities': { paramsTuple?: []; params?: {} }
    'public_hall.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_hall.availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_auth.me': { paramsTuple?: []; params?: {} }
    'users.notification.index': { paramsTuple?: []; params?: {} }
    'users.notification.unreadCount': { paramsTuple?: []; params?: {} }
    'user_booking.index': { paramsTuple?: []; params?: {} }
    'user_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_auth.me': { paramsTuple?: []; params?: {} }
    'company_members.index': { paramsTuple?: []; params?: {} }
    'company_invitations.index': { paramsTuple?: []; params?: {} }
    'companies.notification.index': { paramsTuple?: []; params?: {} }
    'companies.notification.unreadCount': { paramsTuple?: []; params?: {} }
    'company_booking.index': { paramsTuple?: []; params?: {} }
    'company_booking.pending': { paramsTuple?: []; params?: {} }
    'company_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'hall.index': { paramsTuple?: []; params?: {} }
    'hall.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_auth.me': { paramsTuple?: []; params?: {} }
    'admin.get_statistics': { paramsTuple?: []; params?: {} }
    'admin.get_users': { paramsTuple?: []; params?: {} }
    'admin.get_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_companies': { paramsTuple?: []; params?: {} }
    'admin.get_pending_companies': { paramsTuple?: []; params?: {} }
    'admin.get_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_halls': { paramsTuple?: []; params?: {} }
    'admin.get_bookings': { paramsTuple?: []; params?: {} }
    'health_checks': { paramsTuple?: []; params?: {} }
    'health_checks.live': { paramsTuple?: []; params?: {} }
    'public_company_invitations.inspect': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'public_hall.index': { paramsTuple?: []; params?: {} }
    'public_hall.cities': { paramsTuple?: []; params?: {} }
    'public_hall.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_hall.availability': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_auth.me': { paramsTuple?: []; params?: {} }
    'users.notification.index': { paramsTuple?: []; params?: {} }
    'users.notification.unreadCount': { paramsTuple?: []; params?: {} }
    'user_booking.index': { paramsTuple?: []; params?: {} }
    'user_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_auth.me': { paramsTuple?: []; params?: {} }
    'company_members.index': { paramsTuple?: []; params?: {} }
    'company_invitations.index': { paramsTuple?: []; params?: {} }
    'companies.notification.index': { paramsTuple?: []; params?: {} }
    'companies.notification.unreadCount': { paramsTuple?: []; params?: {} }
    'company_booking.index': { paramsTuple?: []; params?: {} }
    'company_booking.pending': { paramsTuple?: []; params?: {} }
    'company_booking.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'hall.index': { paramsTuple?: []; params?: {} }
    'hall.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_auth.me': { paramsTuple?: []; params?: {} }
    'admin.get_statistics': { paramsTuple?: []; params?: {} }
    'admin.get_users': { paramsTuple?: []; params?: {} }
    'admin.get_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_companies': { paramsTuple?: []; params?: {} }
    'admin.get_pending_companies': { paramsTuple?: []; params?: {} }
    'admin.get_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_halls': { paramsTuple?: []; params?: {} }
    'admin.get_bookings': { paramsTuple?: []; params?: {} }
    'health_checks': { paramsTuple?: []; params?: {} }
    'health_checks.live': { paramsTuple?: []; params?: {} }
    'public_company_invitations.inspect': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'user_auth.register': { paramsTuple?: []; params?: {} }
    'user_auth.login': { paramsTuple?: []; params?: {} }
    'user_auth.logout': { paramsTuple?: []; params?: {} }
    'user_push_installations.store': { paramsTuple?: []; params?: {} }
    'user_auth.verify_email': { paramsTuple?: []; params?: {} }
    'user_auth.resend_verification': { paramsTuple?: []; params?: {} }
    'users.notification.markAsRead': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'users.notification.markAllAsRead': { paramsTuple?: []; params?: {} }
    'user_booking.store': { paramsTuple?: []; params?: {} }
    'user_booking.cancel': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_auth.register': { paramsTuple?: []; params?: {} }
    'company_auth.login': { paramsTuple?: []; params?: {} }
    'company_auth.logout': { paramsTuple?: []; params?: {} }
    'company_invitations.store': { paramsTuple?: []; params?: {} }
    'company_invitations.resend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'push_installations.store': { paramsTuple?: []; params?: {} }
    'companies.notification.markAsRead': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'companies.notification.markAllAsRead': { paramsTuple?: []; params?: {} }
    'company_booking.accept': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_booking.reject': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'hall.store': { paramsTuple?: []; params?: {} }
    'admin_auth.login': { paramsTuple?: []; params?: {} }
    'admin_auth.logout': { paramsTuple?: []; params?: {} }
    'admin.ban_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.unban_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.ban_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.unban_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.approve_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.reject_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.suspend_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.reactivate_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_company_invitations.accept': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'user_push_installations.destroy': { paramsTuple: [ParamValue]; params: {'installationId': ParamValue} }
    'company_members.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_invitations.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'push_installations.destroy': { paramsTuple: [ParamValue]; params: {'installationId': ParamValue} }
    'hall.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.delete_hall': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.delete_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'company_members.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'hall.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}