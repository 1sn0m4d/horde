<br />
<div class="header"><?php echo _("Send by mail") ?></div>
<form id="mail_send" name="mail_send" method="post" action="<?php echo Horde::applicationUrl('mail.php') ?>">
<input type="text" name="email" id="email" size="15" />
<input type="hidden" name="id" id="id" value="<?php echo $id ?>" />
<input type="image" src="<?php echo $registry->getImageDir('horde') ?>/mail.png"></a>
</form>
