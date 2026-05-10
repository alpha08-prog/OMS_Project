import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'access_control.dart';
import 'platform_utils.dart';

// --- Material screen imports ---
import '../screens/auth/login_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/grievance/grievance_list_page.dart';
import '../screens/grievance/grievance_create_page.dart';
import '../screens/grievance/grievance_view_page.dart';
import '../screens/grievance/office_grievance_create_page.dart';
import '../screens/grievance/grievance_hub_page.dart';
import '../screens/grievance/rejected_grievances_page.dart';
import '../screens/visitors/visitor_list_page.dart';
import '../screens/visitors/visitor_log_page.dart';
import '../screens/birthday_page.dart';
import '../screens/train/train_request_list_page.dart';
import '../screens/train/train_request_add_page.dart';
import '../screens/tour/tour_program_list_page.dart';
import '../screens/tour/tour_program_create_page.dart';
import '../screens/tour/invitation_add_page.dart';
import '../screens/tour/event_reports_page.dart';
import '../screens/news/news_list_page.dart';
import '../screens/news/news_add_page.dart';
import '../screens/tasks/task_list_page.dart';
import '../screens/tasks/staff_tasks_page.dart';
import '../screens/admin/action_center_page.dart';
import '../screens/admin/verification_queue_page.dart';
import '../screens/admin/train_queue_page.dart';
import '../screens/admin/tour_queue_page.dart';
import '../screens/admin/print_center_page.dart';
import '../screens/admin/user_management_page.dart';
import '../screens/admin/action_history_page.dart';
import '../screens/admin/birthday_view_page.dart';
import '../screens/profile/change_password_page.dart';
import '../screens/staff/staff_history_page.dart';
import '../screens/history/history_page.dart';
import '../screens/about/about_page.dart';
import '../screens/calendar/calendar_page.dart';
import '../screens/tour/events_page.dart';
import '../screens/tour/cupertino/cupertino_events_page.dart';
import '../screens/tour/super_admin_events_hub_page.dart';
import '../screens/tour/cupertino/cupertino_super_admin_events_hub_page.dart';
import '../screens/tour/super_admin_tour_hub_page.dart';
import '../screens/tour/cupertino/cupertino_super_admin_tour_hub_page.dart';

// --- Cupertino screen imports ---
import '../screens/auth/cupertino/cupertino_login_screen.dart';
import '../screens/home/cupertino/cupertino_home_screen.dart';
import '../screens/grievance/cupertino/cupertino_grievance_list_page.dart';
import '../screens/grievance/cupertino/cupertino_grievance_create_page.dart';
import '../screens/grievance/cupertino/cupertino_grievance_view_page.dart';
import '../screens/grievance/cupertino/cupertino_office_grievance_create_page.dart';
import '../screens/grievance/cupertino/cupertino_grievance_hub_page.dart';
import '../screens/grievance/cupertino/cupertino_rejected_grievances_page.dart';
import '../screens/visitors/cupertino/cupertino_visitor_list_page.dart';
import '../screens/visitors/cupertino/cupertino_visitor_log_page.dart';
import '../screens/cupertino/cupertino_birthday_page.dart';
import '../screens/train/cupertino/cupertino_train_request_list_page.dart';
import '../screens/train/cupertino/cupertino_train_request_add_page.dart';
import '../screens/tour/cupertino/cupertino_tour_program_list_page.dart';
import '../screens/tour/cupertino/cupertino_tour_program_create_page.dart';
import '../screens/tour/cupertino/cupertino_invitation_add_page.dart';
import '../screens/tour/cupertino/cupertino_event_reports_page.dart';
import '../screens/news/cupertino/cupertino_news_list_page.dart';
import '../screens/news/cupertino/cupertino_news_add_page.dart';
import '../screens/tasks/cupertino/cupertino_task_list_page.dart';
import '../screens/tasks/cupertino/cupertino_staff_tasks_page.dart';
import '../screens/admin/cupertino/cupertino_action_center_page.dart';
import '../screens/admin/cupertino/cupertino_verification_queue_page.dart';
import '../screens/admin/cupertino/cupertino_train_queue_page.dart';
import '../screens/admin/cupertino/cupertino_tour_queue_page.dart';
import '../screens/admin/cupertino/cupertino_print_center_page.dart';
import '../screens/admin/cupertino/cupertino_user_management_page.dart';
import '../screens/admin/cupertino/cupertino_action_history_page.dart';
import '../screens/admin/cupertino/cupertino_birthday_view_page.dart';
import '../screens/profile/cupertino/cupertino_change_password_page.dart';
import '../screens/staff/cupertino/cupertino_staff_history_page.dart';
import '../screens/history/cupertino/cupertino_history_page.dart';
import '../screens/about/cupertino/cupertino_about_page.dart';
import '../screens/notifications/notifications_page.dart';
import '../screens/notifications/cupertino/cupertino_notifications_page.dart';

class AppNavigator {
  /// Creates a platform-appropriate route
  static Route<T> route<T>(
      Widget Function() materialBuilder, Widget Function() cupertinoBuilder) {
    if (PlatformUtils.isCupertino) {
      return CupertinoPageRoute(builder: (_) => cupertinoBuilder());
    }
    return MaterialPageRoute(builder: (_) => materialBuilder());
  }

  /// Push a new screen
  static Future<T?> push<T>(BuildContext context,
      Widget Function() materialBuilder, Widget Function() cupertinoBuilder) {
    return Navigator.push(context, route(materialBuilder, cupertinoBuilder));
  }

  /// Push replacement
  static Future<T?> pushReplacement<T extends Object?, TO extends Object?>(
      BuildContext context,
      Widget Function() materialBuilder,
      Widget Function() cupertinoBuilder) {
    return Navigator.pushReplacement(
        context, route(materialBuilder, cupertinoBuilder));
  }

  /// Push and remove until
  static Future<T?> pushAndRemoveUntil<T extends Object?>(
      BuildContext context,
      Widget Function() materialBuilder,
      Widget Function() cupertinoBuilder,
      RoutePredicate predicate) {
    return Navigator.pushAndRemoveUntil(
        context, route(materialBuilder, cupertinoBuilder), predicate);
  }

  // ============================================
  // CONVENIENCE SCREEN NAVIGATORS
  // ============================================

  static void toHome(BuildContext context,
      {required String userName, required String role}) {
    pushReplacement(
      context,
      () => HomeScreen(userName: userName, role: role),
      () => CupertinoHomeScreen(userName: userName, role: role),
    );
  }

  static void toLogin(BuildContext context) {
    pushAndRemoveUntil(
      context,
      () => const LoginScreen(),
      () => const CupertinoLoginScreen(),
      (route) => false,
    );
  }

  static void toGrievanceList(BuildContext context, {required String role}) {
    push(
      context,
      () => GrievanceListPage(role: role),
      () => CupertinoGrievanceListPage(role: role),
    );
  }

  static void toGrievanceHub(BuildContext context, {required String role}) {
    push(
      context,
      () => GrievanceHubPage(role: role),
      () => CupertinoGrievanceHubPage(role: role),
    );
  }

  /// Role-aware grievance entry: STAFF -> hub (Public/Office/Old),
  /// ADMIN+ -> Verify Grievance queue (no add capability).
  static void toGrievanceEntry(BuildContext context,
      {required String role}) {
    if (role == Roles.staff) {
      toGrievanceHub(context, role: role);
    } else {
      toVerificationQueue(context);
    }
  }

  static void toGrievanceCreate(BuildContext context, {required String role}) {
    push(
      context,
      () => const GrievanceCreatePage(),
      () => CupertinoGrievanceCreatePage(role: role),
    );
  }

  static void toGrievanceView(BuildContext context,
      {required Map<String, dynamic> grievanceData, required String role}) {
    push(
      context,
      () => GrievanceViewPage(grievanceData: grievanceData, role: role),
      () => CupertinoGrievanceViewPage(
          grievanceId: grievanceData['id']?.toString() ?? '', role: role),
    );
  }

  static void toRejectedGrievances(BuildContext context,
      {required String role}) {
    push(
      context,
      () => RejectedGrievancesPage(role: role),
      () => CupertinoRejectedGrievancesPage(role: role),
    );
  }

  static void toOfficeGrievanceCreate(BuildContext context) {
    push(
      context,
      () => const OfficeGrievanceCreatePage(),
      () => const CupertinoOfficeGrievanceCreatePage(),
    );
  }

  static void toVisitorList(BuildContext context, {required String role}) {
    push(
      context,
      () => VisitorListPage(role: role),
      () => CupertinoVisitorListPage(role: role),
    );
  }

  /// Open the visitor log form (form-only, no list view).
  static void toVisitorLog(BuildContext context) {
    push(
      context,
      () => const VisitorLogPage(),
      () => const CupertinoVisitorLogPage(),
    );
  }

  /// Role-aware visitor entry: STAFF -> log form only, ADMIN+ -> list view.
  static void toVisitorEntry(BuildContext context, {required String role}) {
    if (role == Roles.staff) {
      toVisitorLog(context);
    } else {
      toVisitorList(context, role: role);
    }
  }

  static void toBirthday(BuildContext context, {required String role}) {
    push(
      context,
      () => BirthdayPage(role: role),
      () => CupertinoBirthdayPage(role: role),
    );
  }

  static void toTrainRequestList(BuildContext context,
      {required String role}) {
    push(
      context,
      () => TrainRequestListPage(role: role),
      () => CupertinoTrainRequestListPage(role: role),
    );
  }

  static void toTrainRequestAdd(BuildContext context,
      {required String role}) {
    push(
      context,
      () => const TrainRequestAddPage(),
      () => CupertinoTrainRequestAddPage(role: role),
    );
  }

  /// Role-aware train request entry: STAFF -> add form, ADMIN+ -> Train EQ Requests queue.
  static void toTrainRequestEntry(BuildContext context,
      {required String role}) {
    if (role == Roles.staff) {
      toTrainRequestAdd(context, role: role);
    } else {
      toTrainQueue(context);
    }
  }

  static void toTourProgramList(BuildContext context,
      {required String role}) {
    push(
      context,
      () => TourProgramListPage(role: role),
      () => CupertinoTourProgramListPage(role: role),
    );
  }

  static void toTourProgramCreate(BuildContext context,
      {required String role}) {
    push(
      context,
      () => const TourProgramCreatePage(),
      () => CupertinoTourProgramCreatePage(role: role),
    );
  }

  /// Staff-only "Add Invitation" form (creates a TourProgram on the backend).
  static void toInvitationAdd(BuildContext context) {
    push(
      context,
      () => const InvitationAddPage(),
      () => const CupertinoInvitationAddPage(),
    );
  }

  /// Staff "Event Reports" — list of accepted past events awaiting a report,
  /// with a Submit Report bottom-sheet form per row.
  static void toEventReports(BuildContext context) {
    push(
      context,
      () => const EventReportsPage(),
      () => const CupertinoEventReportsPage(),
    );
  }

  /// Role-aware tour program entry: STAFF -> Add Invitation, ADMIN+ -> list.
  static void toTourProgramEntry(BuildContext context,
      {required String role}) {
    if (role == Roles.staff) {
      toInvitationAdd(context);
    } else {
      toTourProgramList(context, role: role);
    }
  }

  static void toNewsList(BuildContext context, {required String role}) {
    push(
      context,
      () => NewsListPage(role: role),
      () => CupertinoNewsListPage(role: role),
    );
  }

  /// Staff-only "Add News" form (creates a NewsIntelligence on the backend).
  static void toNewsAdd(BuildContext context) {
    push(
      context,
      () => const NewsAddPage(),
      () => const CupertinoNewsAddPage(),
    );
  }

  /// Role-aware news entry: STAFF -> add form, ADMIN+ -> list.
  static void toNewsEntry(BuildContext context, {required String role}) {
    if (role == Roles.staff) {
      toNewsAdd(context);
    } else {
      toNewsList(context, role: role);
    }
  }

  static void toTaskList(BuildContext context, {required String role}) {
    push(
      context,
      () => TaskListPage(role: role),
      () => CupertinoTaskListPage(role: role),
    );
  }

  static void toStaffTasks(BuildContext context) {
    push(
      context,
      () => const StaffTasksPage(),
      () => const CupertinoStaffTasksPage(),
    );
  }

  static void toActionCenter(BuildContext context, {required String role}) {
    push(
      context,
      () => ActionCenterPage(role: role),
      () => CupertinoActionCenterPage(role: role),
    );
  }

  static void toVerificationQueue(BuildContext context) {
    push(
      context,
      () => const VerificationQueuePage(),
      () => const CupertinoVerificationQueuePage(),
    );
  }

  static void toTrainQueue(BuildContext context) {
    push(
      context,
      () => const TrainQueuePage(),
      () => const CupertinoTrainQueuePage(),
    );
  }

  static void toTourQueue(BuildContext context) {
    push(
      context,
      () => const TourQueuePage(),
      () => const CupertinoTourQueuePage(),
    );
  }

  static void toPrintCenter(BuildContext context) {
    push(
      context,
      () => const PrintCenterPage(),
      () => const CupertinoPrintCenterPage(),
    );
  }

  static void toUserManagement(BuildContext context) {
    push(
      context,
      () => const UserManagementPage(),
      () => const CupertinoUserManagementPage(),
    );
  }

  /// Admin Action History — log of all admin actions (verifications,
  /// approvals, rejections, tour decisions) with stats and filters.
  static void toActionHistory(BuildContext context) {
    push(
      context,
      () => const ActionHistoryPage(),
      () => const CupertinoActionHistoryPage(),
    );
  }

  /// Admin View Birthdays — directory of all saved birthdays, filterable
  /// by month and name.
  static void toBirthdayView(BuildContext context) {
    push(
      context,
      () => const BirthdayViewPage(),
      () => const CupertinoBirthdayViewPage(),
    );
  }

  static void toChangePassword(BuildContext context) {
    push(
      context,
      () => const ChangePasswordPage(),
      () => const CupertinoChangePasswordPage(),
    );
  }

  static void toStaffHistory(BuildContext context) {
    push(
      context,
      () => const StaffHistoryPage(),
      () => const CupertinoStaffHistoryPage(),
    );
  }

  static void toHistory(BuildContext context, {required String role}) {
    push(
      context,
      () => HistoryPage(role: role),
      () => CupertinoHistoryPage(role: role),
    );
  }

  static void toAbout(BuildContext context) {
    push(
      context,
      () => const AboutPage(),
      () => const CupertinoAboutPage(),
    );
  }

  static void toCalendar(BuildContext context, {required String role}) {
    push(
      context,
      () => CalendarPage(role: role),
      () => CalendarPage(role: role), // Material-only for now
    );
  }

  static void toEvents(BuildContext context, {required String role}) {
    push(
      context,
      () => EventsPage(role: role),
      () => CupertinoEventsPage(role: role),
    );
  }

  /// Super Admin Events hub: 3 tappable tiles -> Today / Upcoming / All Events.
  static void toSuperAdminEventsHub(BuildContext context) {
    push(
      context,
      () => const SuperAdminEventsHubPage(),
      () => const CupertinoSuperAdminEventsHubPage(),
    );
  }

  /// Super Admin Tour Programs hub: 3 tappable tiles -> Today / Upcoming /
  /// All Programs. View-only — no add / edit / decision actions.
  static void toSuperAdminTourHub(BuildContext context) {
    push(
      context,
      () => const SuperAdminTourHubPage(),
      () => const CupertinoSuperAdminTourHubPage(),
    );
  }

  /// In-app notification list (bell). Returns when the user pops back so
  /// the caller can refresh the unread badge.
  static Future<T?> toNotifications<T>(BuildContext context,
      {required String role}) {
    return push<T>(
      context,
      () => NotificationsPage(role: role),
      () => CupertinoNotificationsPage(role: role),
    );
  }
}
