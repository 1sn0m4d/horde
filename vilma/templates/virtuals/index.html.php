<p class="item">
 &nbsp;<a href="<tag:actions.new_url />"><tag:actions.new_text /></a> |
 &nbsp;<a href="<tag:actions.users_url />"><tag:actions.users_text /></a>
</p>

<if:virtuals>
<table class="horde-table">
 <tr class="item">
  <th>&nbsp;</th>
  <th>
   <?php echo _("Virtual Email Address") ?>
  </th>
  <th>
   <?php echo _("Destination") ?>
  </th>
 </tr>
 <loop:virtuals>
 <tr>
  <td>
   <a href="<tag:virtuals.edit_url />"><tag:images.edit /></a>
   <a href="<tag:virtuals.del_url />"><tag:images.delete /></a>
  </td>
  <td>
   <tag:virtuals.virtual_email />
  </td>
  <td align="center">
   <tag:virtuals.virtual_destination />
  </td>
 </tr>
 </loop:virtuals>
</table>
</if:virtuals>
