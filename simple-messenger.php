<?php
/**
 * Plugin Name: مسنجر ساده (Simple Messenger)
 * Description: چت خصوصی بین اعضای سایت. فقط کاربران واردشده می‌توانند از مسنجر استفاده کنند. سازگار با ورود پیامکی پینوا. شورت‌کد: [simple_messenger]
 * Version: 1.0.0
 * Author: Your Name
 * Text Domain: simple-messenger
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SMSG_VERSION', '1.0.0' );
define( 'SMSG_URL', plugin_dir_url( __FILE__ ) );

final class SMSG_Plugin {

	const OPT = 'smsg_settings';

	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'smsg_messages';
	}

	public static function defaults() {
		return array(
			'login_url'      => '',   // آدرس صفحه ورود پینوا
			'register_url'   => '',   // اگر خالی باشد همان صفحه ورود استفاده می‌شود
			'redirect_login' => 0,    // تغییر مسیر wp-login.php به صفحه ورود پینوا
			'poll_interval'  => 4,    // ثانیه
			'max_length'     => 1000, // حداکثر طول پیام
		);
	}

	public static function settings() {
		return wp_parse_args( get_option( self::OPT, array() ), self::defaults() );
	}

	/* ---------- نصب ---------- */

	public static function activate() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$table   = self::table();
		$charset = $wpdb->get_charset_collate();
		dbDelta( "CREATE TABLE {$table} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			sender_id BIGINT(20) UNSIGNED NOT NULL,
			receiver_id BIGINT(20) UNSIGNED NOT NULL,
			message TEXT NOT NULL,
			is_read TINYINT(1) NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY pair (sender_id, receiver_id),
			KEY inbox (receiver_id, is_read)
		) {$charset};" );
		add_option( self::OPT, self::defaults() );
	}

	public static function init() {
		add_shortcode( 'simple_messenger', array( __CLASS__, 'shortcode' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'login_init', array( __CLASS__, 'maybe_redirect_login' ) );
		add_filter( 'login_url', array( __CLASS__, 'filter_login_url' ), 10, 3 );
		add_filter( 'register_url', array( __CLASS__, 'filter_register_url' ) );
	}

	/* ---------- ورود / ثبت‌نام (پینوا) ---------- */

	public static function filter_login_url( $login_url, $redirect, $force_reauth ) {
		$s = self::settings();
		if ( empty( $s['login_url'] ) ) {
			return $login_url;
		}
		return $redirect ? add_query_arg( 'redirect_to', rawurlencode( $redirect ), $s['login_url'] ) : $s['login_url'];
	}

	public static function filter_register_url( $url ) {
		$s = self::settings();
		if ( ! empty( $s['register_url'] ) ) {
			return $s['register_url'];
		}
		return ! empty( $s['login_url'] ) ? $s['login_url'] : $url;
	}

	/**
	 * فقط درخواست‌های GET برای ورود/ثبت‌نام منتقل می‌شوند.
	 * برای ورود اضطراری مدیر: wp-login.php?smsg_bypass=1
	 */
	public static function maybe_redirect_login() {
		$s = self::settings();
		if ( empty( $s['redirect_login'] ) || empty( $s['login_url'] ) ) {
			return;
		}
		if ( isset( $_GET['smsg_bypass'] ) || 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			return;
		}
		$action = isset( $_REQUEST['action'] ) ? sanitize_key( $_REQUEST['action'] ) : 'login';
		if ( ! in_array( $action, array( 'login', 'register' ), true ) ) {
			return; // خروج، بازیابی رمز و ... دست‌نخورده می‌مانند
		}
		$target = ( 'register' === $action && ! empty( $s['register_url'] ) ) ? $s['register_url'] : $s['login_url'];
		if ( ! empty( $_GET['redirect_to'] ) ) {
			$target = add_query_arg( 'redirect_to', rawurlencode( wp_unslash( $_GET['redirect_to'] ) ), $target );
		}
		wp_redirect( $target ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	/* ---------- شورت‌کد ---------- */

	public static function shortcode() {
		$s = self::settings();

		if ( ! is_user_logged_in() ) {
			global $wp;
			$current = home_url( add_query_arg( array(), $wp->request ?? '' ) );
			$login   = wp_login_url( $current );
			$reg     = ! empty( $s['register_url'] ) ? $s['register_url'] : $login;
			wp_enqueue_style( 'smsg', SMSG_URL . 'assets/messenger.css', array(), SMSG_VERSION );
			ob_start(); ?>
			<div class="smsg-gate" dir="rtl">
				<h3>برای استفاده از مسنجر وارد شوید</h3>
				<p>فقط اعضای سایت می‌توانند پیام بفرستند و دریافت کنند.</p>
				<p>
					<a class="smsg-btn" href="<?php echo esc_url( $login ); ?>">ورود</a>
					<a class="smsg-btn smsg-btn-ghost" href="<?php echo esc_url( $reg ); ?>">ثبت‌نام</a>
				</p>
			</div>
			<?php
			return ob_get_clean();
		}

		wp_enqueue_style( 'smsg', SMSG_URL . 'assets/messenger.css', array(), SMSG_VERSION );
		wp_enqueue_script( 'smsg', SMSG_URL . 'assets/messenger.js', array(), SMSG_VERSION, true );
		wp_localize_script( 'smsg', 'SMSG', array(
			'loggedIn' => true,
			'rest'     => esc_url_raw( rest_url( 'smsg/v1/' ) ),
			'nonce'    => wp_create_nonce( 'wp_rest' ),
			'me'       => get_current_user_id(),
			'poll'     => max( 2, (int) $s['poll_interval'] ) * 1000,
			'max'      => (int) $s['max_length'],
		) );

		return '<div id="smsg-app" dir="rtl" aria-live="polite"></div>';
	}

	/* ---------- REST API ---------- */

	public static function routes() {
		$perm = static function () {
			return is_user_logged_in();
		};
		register_rest_route( 'smsg/v1', '/users', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_users' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/conversations', array(
			'methods' => 'GET', 'callback' => array( __CLASS__, 'api_conversations' ), 'permission_callback' => $perm,
		) );
		register_rest_route( 'smsg/v1', '/messages', array(
			array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'api_get_messages' ), 'permission_callback' => $perm ),
			array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'api_send' ), 'permission_callback' => $perm ),
		) );
	}

	private static function user_card( $user_id ) {
		$u = get_userdata( $user_id );
		if ( ! $u ) {
			return array( 'id' => (int) $user_id, 'name' => 'کاربر حذف‌شده', 'avatar' => '' );
		}
		return array(
			'id'     => (int) $u->ID,
			'name'   => $u->display_name, // عمداً نام کاربری (شماره موبایل) نمایش داده نمی‌شود
			'avatar' => get_avatar_url( $u->ID, array( 'size' => 64 ) ),
		);
	}

	private static function fmt( $row ) {
		return array(
			'id'   => (int) $row->id,
			'from' => (int) $row->sender_id,
			'to'   => (int) $row->receiver_id,
			'text' => $row->message,
			'ts'   => strtotime( $row->created_at . ' UTC' ),
		);
	}

	public static function api_users( WP_REST_Request $req ) {
		$term = trim( (string) $req->get_param( 'search' ) );
		if ( mb_strlen( $term ) < 2 ) {
			return array();
		}
		$q = new WP_User_Query( array(
			'search'         => '*' . esc_attr( $term ) . '*',
			'search_columns' => array( 'display_name', 'user_nicename' ), // user_login عمداً حذف شده
			'exclude'        => array( get_current_user_id() ),
			'number'         => 20,
			'fields'         => 'ID',
		) );
		return array_map( array( __CLASS__, 'user_card' ), $q->get_results() );
	}

	public static function api_conversations() {
		global $wpdb;
		$t  = self::table();
		$me = get_current_user_id();

		$rows = $wpdb->get_results( $wpdb->prepare(
			"SELECT m.* FROM {$t} m INNER JOIN (
				SELECT IF(sender_id=%d, receiver_id, sender_id) AS peer, MAX(id) AS last_id
				FROM {$t} WHERE sender_id=%d OR receiver_id=%d GROUP BY peer
			) x ON m.id = x.last_id ORDER BY m.id DESC LIMIT 100",
			$me, $me, $me
		) );
		$unread_rows = $wpdb->get_results( $wpdb->prepare(
			"SELECT sender_id, COUNT(*) c FROM {$t} WHERE receiver_id=%d AND is_read=0 GROUP BY sender_id", $me
		) );
		$unread = array();
		foreach ( $unread_rows as $r ) {
			$unread[ (int) $r->sender_id ] = (int) $r->c;
		}

		$out = array();
		foreach ( $rows as $r ) {
			$peer  = (int) ( (int) $r->sender_id === $me ? $r->receiver_id : $r->sender_id );
			$out[] = array(
				'user'   => self::user_card( $peer ),
				'last'   => self::fmt( $r ),
				'unread' => $unread[ $peer ] ?? 0,
			);
		}
		return $out;
	}

	public static function api_get_messages( WP_REST_Request $req ) {
		global $wpdb;
		$t     = self::table();
		$me    = get_current_user_id();
		$peer  = (int) $req->get_param( 'with' );
		$after = (int) $req->get_param( 'after' );

		if ( ! $peer || ! get_userdata( $peer ) ) {
			return new WP_Error( 'smsg_user', 'کاربر پیدا نشد.', array( 'status' => 404 ) );
		}

		if ( $after > 0 ) {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM {$t} WHERE id > %d AND ((sender_id=%d AND receiver_id=%d) OR (sender_id=%d AND receiver_id=%d)) ORDER BY id ASC LIMIT 100",
				$after, $me, $peer, $peer, $me
			) );
		} else {
			$rows = $wpdb->get_results( $wpdb->prepare(
				"SELECT * FROM (SELECT * FROM {$t} WHERE (sender_id=%d AND receiver_id=%d) OR (sender_id=%d AND receiver_id=%d) ORDER BY id DESC LIMIT 50) x ORDER BY id ASC",
				$me, $peer, $peer, $me
			) );
		}

		// پیام‌های دریافتی این گفتگو خوانده‌شده علامت می‌خورند
		$wpdb->query( $wpdb->prepare(
			"UPDATE {$t} SET is_read=1 WHERE receiver_id=%d AND sender_id=%d AND is_read=0", $me, $peer
		) );

		return array_map( array( __CLASS__, 'fmt' ), $rows );
	}

	public static function api_send( WP_REST_Request $req ) {
		global $wpdb;
		$me  = get_current_user_id();
		$to  = (int) $req->get_param( 'to' );
		$max = (int) self::settings()['max_length'];
		$txt = trim( sanitize_textarea_field( (string) $req->get_param( 'message' ) ) );

		if ( ! $to || $to === $me || ! get_userdata( $to ) ) {
			return new WP_Error( 'smsg_user', 'گیرنده نامعتبر است.', array( 'status' => 400 ) );
		}
		if ( '' === $txt ) {
			return new WP_Error( 'smsg_empty', 'پیام خالی است.', array( 'status' => 400 ) );
		}
		if ( mb_strlen( $txt ) > $max ) {
			return new WP_Error( 'smsg_long', "پیام نباید بیشتر از {$max} کاراکتر باشد.", array( 'status' => 400 ) );
		}

		// محدودیت ساده: ۲۰ پیام در دقیقه برای هر کاربر
		$key   = 'smsg_rate_' . $me;
		$count = (int) get_transient( $key );
		if ( $count >= 20 ) {
			return new WP_Error( 'smsg_rate', 'تعداد پیام‌ها زیاد است. کمی صبر کنید.', array( 'status' => 429 ) );
		}
		set_transient( $key, $count + 1, MINUTE_IN_SECONDS );

		$wpdb->insert( self::table(), array(
			'sender_id'   => $me,
			'receiver_id' => $to,
			'message'     => $txt,
			'is_read'     => 0,
			'created_at'  => gmdate( 'Y-m-d H:i:s' ),
		), array( '%d', '%d', '%s', '%d', '%s' ) );

		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id=%d', $wpdb->insert_id ) );
		return self::fmt( $row );
	}

	/* ---------- تنظیمات ---------- */

	public static function admin_menu() {
		add_options_page( 'مسنجر ساده', 'مسنجر ساده', 'manage_options', 'simple-messenger', array( __CLASS__, 'settings_page' ) );
	}

	public static function register_settings() {
		register_setting( 'smsg_group', self::OPT, array( 'sanitize_callback' => array( __CLASS__, 'sanitize' ) ) );
	}

	public static function sanitize( $in ) {
		return array(
			'login_url'      => esc_url_raw( $in['login_url'] ?? '' ),
			'register_url'   => esc_url_raw( $in['register_url'] ?? '' ),
			'redirect_login' => empty( $in['redirect_login'] ) ? 0 : 1,
			'poll_interval'  => min( 60, max( 2, (int) ( $in['poll_interval'] ?? 4 ) ) ),
			'max_length'     => min( 5000, max( 50, (int) ( $in['max_length'] ?? 1000 ) ) ),
		);
	}

	public static function settings_page() {
		$s = self::settings();
		$o = self::OPT; ?>
		<div class="wrap" dir="rtl">
			<h1>تنظیمات مسنجر ساده</h1>
			<p>شورت‌کد را در یک برگه قرار دهید: <code>[simple_messenger]</code></p>
			<form method="post" action="options.php">
				<?php settings_fields( 'smsg_group' ); ?>
				<table class="form-table">
					<tr><th>آدرس صفحه ورود پینوا</th>
						<td><input type="url" class="regular-text" style="direction:ltr" name="<?php echo esc_attr( $o ); ?>[login_url]" value="<?php echo esc_attr( $s['login_url'] ); ?>" placeholder="https://example.com/login/">
						<p class="description">آدرس برگه‌ای که فرم ورود پیامکی پینوا در آن است.</p></td></tr>
					<tr><th>آدرس صفحه ثبت‌نام</th>
						<td><input type="url" class="regular-text" style="direction:ltr" name="<?php echo esc_attr( $o ); ?>[register_url]" value="<?php echo esc_attr( $s['register_url'] ); ?>">
						<p class="description">اگر خالی بماند، همان صفحه ورود استفاده می‌شود (در ورود پیامکی معمولاً ثبت‌نام و ورود یکی است).</p></td></tr>
					<tr><th>انتقال wp-login.php</th>
						<td><label><input type="checkbox" name="<?php echo esc_attr( $o ); ?>[redirect_login]" value="1" <?php checked( $s['redirect_login'] ); ?>> صفحه ورود وردپرس به صفحه ورود پینوا منتقل شود</label>
						<p class="description">ورود اضطراری مدیر: <code style="direction:ltr"><?php echo esc_html( site_url( 'wp-login.php?smsg_bypass=1' ) ); ?></code> — این آدرس را جایی یادداشت کنید.</p></td></tr>
					<tr><th>فاصله بروزرسانی (ثانیه)</th>
						<td><input type="number" min="2" max="60" name="<?php echo esc_attr( $o ); ?>[poll_interval]" value="<?php echo esc_attr( $s['poll_interval'] ); ?>"></td></tr>
					<tr><th>حداکثر طول پیام</th>
						<td><input type="number" min="50" max="5000" name="<?php echo esc_attr( $o ); ?>[max_length]" value="<?php echo esc_attr( $s['max_length'] ); ?>"></td></tr>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}

register_activation_hook( __FILE__, array( 'SMSG_Plugin', 'activate' ) );
add_action( 'plugins_loaded', array( 'SMSG_Plugin', 'init' ) );
