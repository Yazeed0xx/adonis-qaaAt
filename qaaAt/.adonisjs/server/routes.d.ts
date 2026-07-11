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
    'venues.index': { paramsTuple?: []; params?: {} }
    'venues.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'venues.store': { paramsTuple?: []; params?: {} }
    'venues.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.index': { paramsTuple?: []; params?: {} }
    'spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.store': { paramsTuple?: []; params?: {} }
    'spaces.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.submit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.index': { paramsTuple?: []; params?: {} }
    'company_calendar.show_policy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.policy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.list_sessions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.create_session': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.update_session': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'sessionId': ParamValue} }
    'company_calendar.destroy_session': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'sessionId': ParamValue} }
    'company_calendar.list_exceptions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.exception': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.update_exception': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'exceptionId': ParamValue} }
    'company_calendar.destroy_exception': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'exceptionId': ParamValue} }
    'company_calendar.external': { paramsTuple?: []; params?: {} }
    'company_calendar.update_external': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.destroy_external': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_availability.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.store_booking': { paramsTuple?: []; params?: {} }
    'user_requests.bookings': { paramsTuple?: []; params?: {} }
    'user_requests.show_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.cancel_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.create_inquiry': { paramsTuple?: []; params?: {} }
    'user_requests.inquiries': { paramsTuple?: []; params?: {} }
    'user_requests.show_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.inquiry_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.cancel_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.create_visit': { paramsTuple?: []; params?: {} }
    'user_requests.visits': { paramsTuple?: []; params?: {} }
    'user_requests.show_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.cancel_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.accept_visit_alternative': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.reject_visit_alternative': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.payable': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'user_payments.initiate': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'user_payments.cancel': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'user_payments.index': { paramsTuple?: []; params?: {} }
    'user_payments.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.receipt': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_payments.index': { paramsTuple?: []; params?: {} }
    'company_payments.refunds': { paramsTuple?: []; params?: {} }
    'company_payments.policies': { paramsTuple?: []; params?: {} }
    'company_payments.store_policy': { paramsTuple?: []; params?: {} }
    'company_payments.cancel': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'company_payments.reconciliation': { paramsTuple?: []; params?: {} }
    'admin_payments.index': { paramsTuple?: []; params?: {} }
    'admin_payments.attempts': { paramsTuple?: []; params?: {} }
    'admin_payments.webhooks': { paramsTuple?: []; params?: {} }
    'admin_payments.refunds': { paramsTuple?: []; params?: {} }
    'admin_payments.reconciliation': { paramsTuple?: []; params?: {} }
    'company_requests.bookings': { paramsTuple?: []; params?: {} }
    'company_requests.show_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.approve_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.reject_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.cancel_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.inquiries': { paramsTuple?: []; params?: {} }
    'company_requests.show_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.inquiry_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.answer_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.transition_inquiry': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'action': ParamValue} }
    'company_requests.visits': { paramsTuple?: []; params?: {} }
    'company_requests.show_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.visit_action': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'action': ParamValue} }
    'company_requests.show_settings': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_requests.update_settings': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'admin_requests.bookings': { paramsTuple?: []; params?: {} }
    'admin_requests.inquiries': { paramsTuple?: []; params?: {} }
    'admin_requests.visits': { paramsTuple?: []; params?: {} }
    'public_pricing.show': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_pricing.rate_plans': { paramsTuple?: []; params?: {} }
    'company_pricing.store_rate_plan': { paramsTuple?: []; params?: {} }
    'company_pricing.update_rate_plan': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.archive_rate_plan': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.services': { paramsTuple?: []; params?: {} }
    'company_pricing.store_service': { paramsTuple?: []; params?: {} }
    'company_pricing.update_service': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.archive_service': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.attach_service': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_pricing.detach_service': { paramsTuple: [ParamValue,ParamValue]; params: {'spaceId': ParamValue,'serviceId': ParamValue} }
    'company_pricing.packages': { paramsTuple?: []; params?: {} }
    'company_pricing.store_package': { paramsTuple?: []; params?: {} }
    'company_pricing.update_package': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.archive_package': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_quotes.index': { paramsTuple?: []; params?: {} }
    'company_quotes.store': { paramsTuple?: []; params?: {} }
    'company_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_quotes.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_quotes.send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_quotes.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.index': { paramsTuple?: []; params?: {} }
    'user_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.accept': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.decline': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_quotes.pricing': { paramsTuple?: []; params?: {} }
    'admin_quotes.index': { paramsTuple?: []; params?: {} }
    'admin_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'space_catalog.index': { paramsTuple?: []; params?: {} }
    'public_spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'admin_spaces.index': { paramsTuple?: []; params?: {} }
    'admin_spaces.pending': { paramsTuple?: []; params?: {} }
    'admin_spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_spaces.publish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_spaces.request_changes': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_spaces.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'venues.index': { paramsTuple?: []; params?: {} }
    'venues.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.index': { paramsTuple?: []; params?: {} }
    'spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.index': { paramsTuple?: []; params?: {} }
    'company_calendar.show_policy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.list_sessions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.list_exceptions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_availability.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.bookings': { paramsTuple?: []; params?: {} }
    'user_requests.show_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.inquiries': { paramsTuple?: []; params?: {} }
    'user_requests.show_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.inquiry_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.visits': { paramsTuple?: []; params?: {} }
    'user_requests.show_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.payable': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'user_payments.index': { paramsTuple?: []; params?: {} }
    'user_payments.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.receipt': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_payments.index': { paramsTuple?: []; params?: {} }
    'company_payments.refunds': { paramsTuple?: []; params?: {} }
    'company_payments.policies': { paramsTuple?: []; params?: {} }
    'company_payments.reconciliation': { paramsTuple?: []; params?: {} }
    'admin_payments.index': { paramsTuple?: []; params?: {} }
    'admin_payments.attempts': { paramsTuple?: []; params?: {} }
    'admin_payments.webhooks': { paramsTuple?: []; params?: {} }
    'admin_payments.refunds': { paramsTuple?: []; params?: {} }
    'admin_payments.reconciliation': { paramsTuple?: []; params?: {} }
    'company_requests.bookings': { paramsTuple?: []; params?: {} }
    'company_requests.show_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.inquiries': { paramsTuple?: []; params?: {} }
    'company_requests.show_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.inquiry_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.visits': { paramsTuple?: []; params?: {} }
    'company_requests.show_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.show_settings': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'admin_requests.bookings': { paramsTuple?: []; params?: {} }
    'admin_requests.inquiries': { paramsTuple?: []; params?: {} }
    'admin_requests.visits': { paramsTuple?: []; params?: {} }
    'public_pricing.show': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_pricing.rate_plans': { paramsTuple?: []; params?: {} }
    'company_pricing.services': { paramsTuple?: []; params?: {} }
    'company_pricing.packages': { paramsTuple?: []; params?: {} }
    'company_quotes.index': { paramsTuple?: []; params?: {} }
    'company_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.index': { paramsTuple?: []; params?: {} }
    'user_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_quotes.pricing': { paramsTuple?: []; params?: {} }
    'admin_quotes.index': { paramsTuple?: []; params?: {} }
    'admin_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'space_catalog.index': { paramsTuple?: []; params?: {} }
    'public_spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_auth.me': { paramsTuple?: []; params?: {} }
    'admin.get_statistics': { paramsTuple?: []; params?: {} }
    'admin.get_users': { paramsTuple?: []; params?: {} }
    'admin.get_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_companies': { paramsTuple?: []; params?: {} }
    'admin.get_pending_companies': { paramsTuple?: []; params?: {} }
    'admin.get_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_halls': { paramsTuple?: []; params?: {} }
    'admin.get_bookings': { paramsTuple?: []; params?: {} }
    'admin_spaces.index': { paramsTuple?: []; params?: {} }
    'admin_spaces.pending': { paramsTuple?: []; params?: {} }
    'admin_spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'venues.index': { paramsTuple?: []; params?: {} }
    'venues.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.index': { paramsTuple?: []; params?: {} }
    'spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.index': { paramsTuple?: []; params?: {} }
    'company_calendar.show_policy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.list_sessions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.list_exceptions': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_availability.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.bookings': { paramsTuple?: []; params?: {} }
    'user_requests.show_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.inquiries': { paramsTuple?: []; params?: {} }
    'user_requests.show_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.inquiry_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.visits': { paramsTuple?: []; params?: {} }
    'user_requests.show_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.payable': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'user_payments.index': { paramsTuple?: []; params?: {} }
    'user_payments.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.receipt': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_payments.index': { paramsTuple?: []; params?: {} }
    'company_payments.refunds': { paramsTuple?: []; params?: {} }
    'company_payments.policies': { paramsTuple?: []; params?: {} }
    'company_payments.reconciliation': { paramsTuple?: []; params?: {} }
    'admin_payments.index': { paramsTuple?: []; params?: {} }
    'admin_payments.attempts': { paramsTuple?: []; params?: {} }
    'admin_payments.webhooks': { paramsTuple?: []; params?: {} }
    'admin_payments.refunds': { paramsTuple?: []; params?: {} }
    'admin_payments.reconciliation': { paramsTuple?: []; params?: {} }
    'company_requests.bookings': { paramsTuple?: []; params?: {} }
    'company_requests.show_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.inquiries': { paramsTuple?: []; params?: {} }
    'company_requests.show_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.inquiry_messages': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.visits': { paramsTuple?: []; params?: {} }
    'company_requests.show_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.show_settings': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'admin_requests.bookings': { paramsTuple?: []; params?: {} }
    'admin_requests.inquiries': { paramsTuple?: []; params?: {} }
    'admin_requests.visits': { paramsTuple?: []; params?: {} }
    'public_pricing.show': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_pricing.rate_plans': { paramsTuple?: []; params?: {} }
    'company_pricing.services': { paramsTuple?: []; params?: {} }
    'company_pricing.packages': { paramsTuple?: []; params?: {} }
    'company_quotes.index': { paramsTuple?: []; params?: {} }
    'company_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.index': { paramsTuple?: []; params?: {} }
    'user_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_quotes.pricing': { paramsTuple?: []; params?: {} }
    'admin_quotes.index': { paramsTuple?: []; params?: {} }
    'admin_quotes.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'space_catalog.index': { paramsTuple?: []; params?: {} }
    'public_spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_auth.me': { paramsTuple?: []; params?: {} }
    'admin.get_statistics': { paramsTuple?: []; params?: {} }
    'admin.get_users': { paramsTuple?: []; params?: {} }
    'admin.get_user': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_companies': { paramsTuple?: []; params?: {} }
    'admin.get_pending_companies': { paramsTuple?: []; params?: {} }
    'admin.get_company': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.get_halls': { paramsTuple?: []; params?: {} }
    'admin.get_bookings': { paramsTuple?: []; params?: {} }
    'admin_spaces.index': { paramsTuple?: []; params?: {} }
    'admin_spaces.pending': { paramsTuple?: []; params?: {} }
    'admin_spaces.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'venues.store': { paramsTuple?: []; params?: {} }
    'spaces.store': { paramsTuple?: []; params?: {} }
    'spaces.submit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.create_session': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.exception': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.external': { paramsTuple?: []; params?: {} }
    'user_requests.store_booking': { paramsTuple?: []; params?: {} }
    'user_requests.cancel_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.create_inquiry': { paramsTuple?: []; params?: {} }
    'user_requests.cancel_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.create_visit': { paramsTuple?: []; params?: {} }
    'user_requests.cancel_visit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.accept_visit_alternative': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_requests.reject_visit_alternative': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_payments.initiate': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'user_payments.cancel': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'company_payments.store_policy': { paramsTuple?: []; params?: {} }
    'company_payments.cancel': { paramsTuple: [ParamValue]; params: {'bookingId': ParamValue} }
    'company_requests.approve_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.reject_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.cancel_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.answer_inquiry': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_requests.transition_inquiry': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'action': ParamValue} }
    'company_requests.visit_action': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'action': ParamValue} }
    'company_pricing.store_rate_plan': { paramsTuple?: []; params?: {} }
    'company_pricing.store_service': { paramsTuple?: []; params?: {} }
    'company_pricing.attach_service': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_pricing.store_package': { paramsTuple?: []; params?: {} }
    'company_quotes.store': { paramsTuple?: []; params?: {} }
    'company_quotes.send': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_quotes.withdraw': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.accept': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'user_quotes.decline': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
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
    'admin_spaces.publish': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_spaces.request_changes': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin_spaces.suspend': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public_company_invitations.accept': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'user_push_installations.destroy': { paramsTuple: [ParamValue]; params: {'installationId': ParamValue} }
    'company_members.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_invitations.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'push_installations.destroy': { paramsTuple: [ParamValue]; params: {'installationId': ParamValue} }
    'hall.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.destroy_session': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'sessionId': ParamValue} }
    'company_calendar.destroy_exception': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'exceptionId': ParamValue} }
    'company_calendar.destroy_external': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.archive_rate_plan': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.archive_service': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.detach_service': { paramsTuple: [ParamValue,ParamValue]; params: {'spaceId': ParamValue,'serviceId': ParamValue} }
    'company_pricing.archive_package': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.delete_hall': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.delete_booking': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'company_members.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'venues.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'spaces.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.update_external': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'hall.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.policy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_calendar.update_session': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'sessionId': ParamValue} }
    'company_calendar.update_exception': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'exceptionId': ParamValue} }
    'company_requests.update_settings': { paramsTuple: [ParamValue]; params: {'spaceId': ParamValue} }
    'company_pricing.update_rate_plan': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.update_service': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_pricing.update_package': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'company_quotes.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}