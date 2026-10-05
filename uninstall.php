<?php
// هنگام «حذف» افزونه، تنظیمات پاک می‌شود. جدول پیام‌ها عمداً نگه داشته می‌شود تا اطلاعات به اشتباه از بین نرود.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}
delete_option( 'smsg_settings' );
